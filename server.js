require('dotenv').config();

const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  GetBucketLocationCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();

// ==========================================
// KONFIGURASI DARI FILE .ENV
// ==========================================
const PORT = process.env.PORT || 3000;
const BUCKET_NAME = process.env.BUCKET_NAME;
const REGION = process.env.AWS_REGION;

// Validasi Fail-Fast: Hentikan server jika .env belum dikonfigurasi dengan benar
if (!BUCKET_NAME || !REGION) {
  console.error('❌ ERROR: Variabel BUCKET_NAME dan AWS_REGION wajib diisi di dalam file .env!');
  process.exit(1);
}

// S3Client otomatis mengambil kredensial dari IAM Role yang menempel di EC2
const s3 = new S3Client({ region: REGION });

// Multer menyimpan file di RAM sementara sebelum dikirim ke S3 (Stateless EC2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // Batas maksimal 20 MB per file
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------
// 1. API: Ambil Daftar File + Metadata S3
// ------------------------------------------
app.get('/api/files', async (req, res) => {
  try {
    const listCmd = new ListObjectsV2Command({ Bucket: BUCKET_NAME });
    const data = await s3.send(listCmd);
    const contents = data.Contents || [];

    // Ambil custom metadata (uploader & description) untuk setiap objek di S3
    const files = await Promise.all(
      contents
        .filter(item => !item.Key.endsWith('/'))
        .map(async (item) => {
          let metadata = {};
          let contentType = 'application/octet-stream';
          try {
            const head = await s3.send(new HeadObjectCommand({
              Bucket: BUCKET_NAME,
              Key: item.Key
            }));
            metadata = head.Metadata || {};
            contentType = head.ContentType || contentType;
          } catch (e) {
            // Lewati jika gagal mengambil metadata spesifik objek
          }

          const parts = item.Key.split('/');
          const category = parts.length > 1 ? parts[0] : 'umum';
          const fileName = parts.slice(1).join('/') || item.Key;

          return {
            key: item.Key,
            name: fileName,
            category: category,
            size: item.Size,
            lastModified: item.LastModified,
            contentType: contentType,
            uploader: metadata.uploader || 'Anonim',
            description: metadata.description || '-'
          };
        })
    );

    // Urutkan dari waktu upload paling baru
    files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    res.json({ success: true, files });
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------
// 2. API: Upload File + Custom Metadata ke S3
// ------------------------------------------
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Tidak ada file yang dipilih.' });
    }

    // Sanitasi karakter agar sesuai standar HTTP Header S3 Metadata (ASCII printable)
    const category = (req.body.category || 'umum').toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const uploader = (req.body.uploader || 'Admin').replace(/[^\x20-\x7E]/g, '');
    const description = (req.body.description || '-').replace(/[^\x20-\x7E]/g, '');

    // Format Object Key dengan prefix kategori folder
    const cleanFileName = req.file.originalname.replace(/\s+/g, '_');
    const objectKey = `${category}/${Date.now()}-${cleanFileName}`;

    const putCmd = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        uploader: uploader,
        description: description
      }
    });

    await s3.send(putCmd);
    res.json({
      success: true,
      key: objectKey,
      message: 'File beserta metadata berhasil disimpan di S3!'
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------
// 3. API: Generate Pre-Signed URL Sementara
// ------------------------------------------
app.get('/api/presign', async (req, res) => {
  try {
    const { key, expires } = req.query;
    if (!key) {
      return res.status(400).json({ success: false, message: 'Parameter key wajib diisi.' });
    }

    // Default aktif 5 menit (300 detik), maksimal 24 jam (86400 detik)
    const expiresIn = Math.min(parseInt(expires) || 300, 86400);
    const cmd = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn });
    res.json({ success: true, url, expiresIn });
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------
// 4. API: Hapus Objek dari S3 Bucket
// ------------------------------------------
app.delete('/api/files', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ success: false, message: 'Parameter key wajib diisi.' });
    }

    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    }));

    res.json({ success: true, message: 'Objek berhasil dihapus dari S3.' });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------
// 5. API: System Health & VPC Endpoint Check
// ------------------------------------------
app.get('/api/system', async (req, res) => {
  const startTime = Date.now();
  try {
    // Menguji koneksi dan latensi dari EC2 ke S3 melewati VPC Gateway Endpoint
    await s3.send(new GetBucketLocationCommand({ Bucket: BUCKET_NAME }));
    const latency = Date.now() - startTime;

    res.json({
      success: true,
      s3Connected: true,
      latencyMs: latency,
      bucket: BUCKET_NAME,
      region: REGION,
      ec2: {
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        uptimeHours: (os.uptime() / 3600).toFixed(2),
        memoryUsagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
      }
    });
  } catch (err) {
    console.error('Error checking system health:', err);
    res.status(500).json({
      success: false,
      s3Connected: false,
      bucket: BUCKET_NAME,
      region: REGION,
      error: err.message
    });
  }
});

// ------------------------------------------
// JALANKAN SERVER EXPRESS
// ------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CloudVault Server aktif di http://0.0.0.0:${PORT}`);
  console.log(`📦 Target S3 Bucket : ${BUCKET_NAME} (${REGION})`);
});