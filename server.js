const express = require('express');
const formidable = require('formidable');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables from the private .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.UPLOAD_PASSWORD;

if (!PASSWORD) {
  console.error("❌ ERROR: UPLOAD_PASSWORD is not set in your .env file!");
  process.exit(1);
}

// Automatically create an 'uploads' directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 1. SERVE THE WEBSITE INTERFACE
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Astro Data Drop</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
          background: #0b0f19; 
          color: #e2e8f0; 
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0; 
          padding: 20px;
          box-sizing: border-box;
        }
        .container { 
          background: #1e293b; 
          padding: 30px; 
          border-radius: 12px; 
          box-shadow: 0 10px 25px rgba(0,0,0,0.5); 
          width: 100%;
          max-width: 450px;
        }
        h2 { margin-top: 0; color: #38bdf8; text-align: center; font-size: 24px; }
        p.subtitle { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 25px; }
        label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #cbd5e1; }
        input { 
          width: 100%; 
          padding: 12px; 
          margin-bottom: 20px; 
          border-radius: 6px; 
          border: 1px solid #475569; 
          background: #0f172a; 
          color: white; 
          box-sizing: border-box;
          font-size: 16px;
        }
        input:focus { outline: 2px solid #38bdf8; border-color: transparent; }
        button { 
          width: 100%; 
          padding: 14px; 
          background: #2563eb; 
          color: white; 
          font-weight: bold; 
          font-size: 16px;
          border: none; 
          border-radius: 6px; 
          cursor: pointer; 
          transition: background 0.2s;
        }
        button:hover { background: #1d4ed8; }
        button:disabled { background: #64748b; cursor: not-allowed; }
        
        /* Progress Bar UI */
        #progressContainer { display: none; margin-top: 25px; background: #0f172a; padding: 15px; border-radius: 8px; }
        #status { font-size: 14px; margin: 0 0 10px 0; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .progress-bar { background: #334155; border-radius: 9999px; height: 12px; overflow: hidden; }
        .progress-fill { background: #10b981; width: 0%; height: 100%; transition: width 0.1s ease; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🌌 Astro Data Drop</h2>
        <p class="subtitle">Upload heavy RAW data directly to the tower PC</p>
        
        <form id="uploadForm">
          <label for="password">Secret Access Password</label>
          <input type="password" id="password" autocomplete="current-password" required>
          
          <label for="fileInput">Select Files (RAW, TIFF, FIT, MP4)</label>
          <input type="file" id="fileInput" multiple required>
          
          <button type="submit" id="submitBtn">Transmit to Tower</button>
        </form>
        
        <div id="progressContainer">
          <p id="status">Preparing transfer...</p>
          <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
        </div>
      </div>

      <script>
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const password = document.getElementById('password').value;
          const files = document.getElementById('fileInput').files;
          const progressContainer = document.getElementById('progressContainer');
          const progressFill = document.getElementById('progressFill');
          const status = document.getElementById('status');
          const submitBtn = document.getElementById('submitBtn');

          if(files.length === 0) return;

          // Disable inputs during active upload
          submitBtn.disabled = true;
          progressContainer.style.display = 'block';
          
          // Process files sequentially to preserve phone/browser stability
          for(let i = 0; i < files.length; i++) {
            const formData = new FormData();
            formData.append('astroFile', files[i]);
            formData.append('password', password);

            status.innerText = \`Uploading (\${i + 1}/\${files.length}): \${files[i].name}\`;
            progressFill.style.width = '0%';

            try {
              await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/upload', true);

                // Live updates for massive files
                xhr.upload.onprogress = (event) => {
                  if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    progressFill.style.width = percentComplete + '%';
                  }
                };

                xhr.onload = () => {
                  if (xhr.status === 200) {
                    resolve();
                  } else {
                    reject(xhr.responseText || 'Transmission error');
                  }
                };

                xhr.onerror = () => reject('Network error connection lost.');
                xhr.send(formData);
              });
            } catch (error) {
              alert('⚠️ Upload Interrupted: ' + error);
              submitBtn.disabled = false;
              return;
            }
          }

          status.innerText = "✨ All files transferred successfully!";
          progressFill.style.width = '100%';
          alert('Transmission complete! Check the tower PC uploads folder.');
          
          // Reset UI
          document.getElementById('fileInput').value = '';
          submitBtn.disabled = false;
          setTimeout(() => { progressContainer.style.display = 'none'; }, 3000);
        });
      </script>
    </body>
    </html>
  `);
});

// 2. SECURELY RECEIVE AND STREAM THE FILES
app.post('/upload', (req, res) => {
  const form = formidable({
    uploadDir: uploadDir,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024 * 1024, // High 50GB limit per file for massive video stacks
    filter: function ({ name, originalFilename, mimetype }) {
      // Keep everything submitted
      return true;
    }
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).send('File parsing error.');
    }

    // Formidable fields return arrays in newer versions
    const submittedPassword = Array.isArray(fields.password) ? fields.password[0] : fields.password;
    const uploadedFile = files.astroFile ? (Array.isArray(files.astroFile) ? files.astroFile[0] : files.astroFile) : null;

    // Password Check
    if (submittedPassword !== PASSWORD) {
      // If password doesn't match, instantly erase the file from your drive
      if (uploadedFile && uploadedFile.filepath) {
        fs.unlinkSync(uploadedFile.filepath);
      }
      return res.status(401).send('Incorrect access password.');
    }

    if (!uploadedFile) {
      return res.status(400).send('No file data captured.');
    }

    // Rename file back to its pristine, original name
    const originalName = uploadedFile.originalFilename || 'astro_file';
    const finalPath = path.join(uploadDir, \`\${Date.now()}-\${originalName}\`);
    
    fs.rename(uploadedFile.filepath, finalPath, (renameErr) => {
      if (renameErr) {
        console.error(renameErr);
        return res.status(500).send('Error cataloging file.');
      }
      console.log(\`📦 Successfully saved: \${originalName}\`);
      res.send('Success.');
    });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`\n==================================================\`);
  console.log(\`🌌 ASTRO DATA DROP SERVER ACTIVE\`);
  console.log(\`🖥️  Listening internally at: http://localhost:\${PORT}\`);
  console.log(\`==================================================\n\`);
});