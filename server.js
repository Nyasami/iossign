const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const bodyParser = require('body-parser');

const app = express();

// Setup Multer for file uploads
const upload = multer({ dest: 'uploads/' });
// Serve static files from the 'signed' directory

app.use(bodyParser.json());

app.use('/signed', express.static(path.join(__dirname, 'signed')));


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint to handle the signing process
app.post('/upload', upload.fields([{ name: 'ipa' }, { name: 'zip' }]), async (req, res) => {
    try {
        const ipaPath = req.files['ipa'][0].path;
        const zipPath = req.files['zip'][0].path;
        const password = req.body.password;
        const bundleId = req.body.bundleID || null;  // Optional bundle ID
        const signedIpaPath = path.join(__dirname, 'signed', 'signedApp.ipa');

        // Create a directory to unzip the contents
        const unzipDir = path.join(__dirname, 'uploads', 'unzipped');
        await fs.promises.mkdir(unzipDir, { recursive: true });

        // Unzip the uploaded file
        await fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: unzipDir }))
            .promise();

        // Find the unzipped P12 and mobileprovision files
        const files = await fs.promises.readdir(unzipDir);
        const p12Path = files.find(file => file.endsWith('.p12'));
        const mobileProvisionPath = files.find(file => file.endsWith('.mobileprovision'));

        if (!p12Path || !mobileProvisionPath) {
            throw new Error('Missing P12 or mobile provisioning file in the ZIP');
        }

        // Path for the extracted files
        const fullP12Path = path.join(unzipDir, p12Path);
        const fullMobileProvisionPath = path.join(unzipDir, mobileProvisionPath);

        // zsign command
        let command = `./zsign -k "${fullP12Path}" -p ${password} -m "${fullMobileProvisionPath}" -o "${signedIpaPath}" "${ipaPath}" -i`;

        // Add optional bundle ID
        if (bundleId) {
            command += ` -b ${bundleId}`;
        }

        console.log('Signing command:', command);
        // Execute the signing process
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error signing app: ${stderr}`);
                return res.status(500).json({ error: 'Failed to sign IPA' });
            }

            // Send the signed IPA file back to the user
            res.download(signedIpaPath);
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: 'An error occurred during the signing process' });
    }
});

app.post('/generate-ota', (req, res) => {
    const signedIpaPath = path.join(__dirname, 'signed', 'signedApp.ipa');
    const bundleId = req.body.bundleID || 'com.example.app';
    const appName = req.body.appName || 'Example App';
    
    createPlist(signedIpaPath, bundleId, appName, (err, plistPath) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to generate manifest.plist' });
        }
        const otaLink = `itms-services://?action=download-manifest&url=http://192.168.1.8:3000/signed/${path.basename(plistPath)}`;
        res.json({ otaLink });
    });
});


app.listen(3000, () => {
    console.log('Server running on port 3000');
});

function createPlist(signedIpaPath, bundleId, appName, callback) {
    const plistContent = `
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
      <dict>
        <key>items</key>
        <array>
          <dict>
            <key>assets</key>
            <array>
              <dict>
                <key>kind</key>
                <string>software-package</string>
                <key>url</key>
                <string>http://192.168.1.8/signed/${path.basename(signedIpaPath)}</string>
              </dict>
            </array>
            <key>metadata</key>
            <dict>
              <key>bundle-identifier</key>
              <string>${bundleId}</string>
              <key>bundle-version</key>
              <string>1.0.0</string>  <!-- Update version dynamically if needed -->
              <key>kind</key>
              <string>software</string>
              <key>title</key>
              <string>${appName}</string>
            </dict>
          </dict>
        </array>
      </dict>
    </plist>`;
    
    const plistPath = path.join(__dirname, 'signed', 'manifest.plist');
    fs.writeFile(plistPath, plistContent, (err) => {
        if (err) {
            return callback(`Error creating plist: ${err}`);
        }
        callback(null, plistPath);
    });
}