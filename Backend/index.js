const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = Date.now() + ext;
      cb(null, filename);
    },
  }),
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/measure", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Field tidak boleh kosong" });
  }
  const ext = path.extname(req.file.originalname);
  const imagePath = path.join(__dirname, req.file.path);
  const outputImageFilename = req.file.filename.replace(ext, "_output" + ext);
  const outputImagePath = path.join(__dirname, "uploads", outputImageFilename);

  const pythonProcess = spawn("python", ["../modeling/main.py", imagePath]);

  let stdout = "";
  let stderr = "";

  pythonProcess.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  pythonProcess.on("close", (code) => {
    if (code !== 0) {
      console.error("Script Python keluar dengan kode", code);
      return res.status(500).json({ error: "Gagal memproses gambar" });
    }

    if (stderr) {
      console.error("Script Python stderr:", stderr);
    }

    console.log("Script Python stdout:", stdout);

    if (fs.existsSync(outputImagePath)) {
      const [boundingBoxAreaCm2, widthCm, heightCm] = stdout
        .split(",")
        .map(Number);

      if (isNaN(boundingBoxAreaCm2) || isNaN(widthCm) || isNaN(heightCm)) {
        console.error("Hasil tidak valid dari script Python:", stdout);
        return res
          .status(500)
          .json({ error: "Hasil tidak valid dari script Python" });
      }

      const outputImageUrl = `https://api2.hkks.shop/uploads/${outputImageFilename}`;

      res.json({
        data: {
          luas: boundingBoxAreaCm2,
          lebar: widthCm,
          tinggi: heightCm,
          url: outputImageUrl,
        },
      });
    } else {
      console.error("Gambar output tidak ditemukan:", outputImagePath);
      res.status(500).json({ error: "Gambar output tidak ditemukan" });
    }

    fs.unlink(imagePath, (err) => {
      if (err) console.error("Error menghapus gambar yang diunggah:", err);
    });
  });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
