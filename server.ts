const axios = require('axios');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const bodyParser = require('body-parser');
const app = express();
const util = require('util');
const exec = util.promisify(require('child_process').exec); // Promisify exec

require('dotenv').config();

// Setup Multer for file uploads
const upload = multer({ dest: 'uploads/' });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use('/signed', express.static(path.join(__dirname, 'signed')));

app.use(express.static(path.join(__dirname, 'view')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'index.html'));
});



// Endpoint to handle the signing process
app.post('/upload', upload.fields([{ name: 'ipa' }, { name: 'zip' }]), async (req, res) => {
    try {
        let ipaPath = ''
        const zipPath = req.files['zip'][0].path;
        const password = req.body.password; 
        const app = req.body.app
        const sessionId = Math.random().toString(36).substring(7);
        const bundleId = 'sign.khoindvn.io.vn' + '.' + app; 
        console.log('app:', app)
        switch (app) {
            case 'Esign':
                ipaPath = path.join(__dirname, 'apps', 'Esign.ipa');
                break;
            case 'Scarlet':
                ipaPath = path.join(__dirname, 'apps', 'Scarlet.ipa');
                break;  
        }

        if (!ipaPath) {
            res.status(400).json({ error: 'Invalid app' });
            throw new Error('Invalid app');
        }

        await fs.promises.mkdir(path.join(__dirname, 'uploads', sessionId), { recursive: true });


        // Create a directory to unzip the contents 
        const unzipDir = path.join(__dirname, 'uploads', sessionId, 'unzipped');
        await fs.promises.mkdir(unzipDir, { recursive: true });

        // Unzip the uploaded file
        await fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: unzipDir }))
            .promise();

        // Find the unzipped P12 and mobileprovision files
        const files = await fs.promises.readdir(unzipDir);
        console.log('Files:', files);
        let p12Path = files.find(file => file.endsWith('.p12'));
        let mobileProvisionPath = files.find(file => file.endsWith('.mobileprovision'));

        if (!p12Path || !mobileProvisionPath) {
            // find a folder inside it
            const folders = await fs.promises.readdir(path.join(unzipDir, files[0]));
            // find the files again in the folder
            p12Path = folders.find(file => file.endsWith('.p12'));
            mobileProvisionPath = folders.find(file => file.endsWith('.mobileprovision'));
            if (!p12Path || !mobileProvisionPath) {
                res.status(400).json({ error: 'Missing P12 or mobile provisioning file in the ZIP' });
                throw new Error('Missing P12 or mobile provisioning file in the ZIP');
            }
            // Update the paths
            p12Path = path.join(files[0], p12Path);
            mobileProvisionPath = path.join(files[0], mobileProvisionPath);
        }
        // Path for the extracted files
        const fullP12Path = path.join(unzipDir, p12Path);
        const fullMobileProvisionPath = path.join(unzipDir, mobileProvisionPath);
        const outputDir = path.join(__dirname, 'signed', sessionId);
        fs.mkdirSync(outputDir, { recursive: true });
        const signedIpaPath = path.join(__dirname, 'signed', sessionId, 'signed.ipa');

        // zsign command
        let command = `./zsign -k "${fullP12Path}" -p "${password}" -m "${fullMobileProvisionPath}" -o "${signedIpaPath}" -b ${bundleId} "${ipaPath}"`;

        console.log('Signing command:', command);
        // Execute the signing process
        
        const { stdout, stderr } = await exec(command);

        if (stderr) {
            console.error(`Error signing app: ${stderr}`);
            res.status(500).json({ error: stderr });
            return;  // Stop further execution
        }
    
        console.log(stdout);
        
    
        createPlist(signedIpaPath, bundleId, app, sessionId, (err, plistPath) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to generate manifest.plist' });
            }
            const otaLink = `itms-services://?action=download-manifest&url=https://sign.khoindvn.io.vn/signed/${sessionId}/manifest.plist`;
            axios.post(`https://api.tinyurl.com/create?api_token=${process.env.TINY_KEY}`, {
                url: otaLink,
            }).then((response) => {
                console.log('TinyURL:', response.data.data.tiny_url);
                res.status(200).json({ otaLink: otaLink, tinyUrl: response.data.data.tiny_url });
            }).catch((error) => {
                console.error('Error creating TinyURL:', error);
                res.status(200).json({ otaLink: otaLink });
            });
        });

    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err });
    }
});


app.get('/show',(req,res) => {
    const uuid = req.query.UDID
    const device = req.query.DEVICE_PRODUCT

    console.log('----------------------------')
    console.log('query:', req.query)
    res.send(uuidHTML(uuid, device));
})


app.listen(3000, () => {
    console.log('Server running on port 3000');
});

function createPlist(signedIpaPath, bundleId, appName, sessionId, callback) {
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
                <string>https://sign.khoindvn.io.vn/signed/${sessionId}/signed.ipa</string>
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
    
    const plistPath = path.join(__dirname, 'signed', sessionId, 'manifest.plist');
    console.log('Plist path:', plistPath);
    console.log('signedIpaPath:', signedIpaPath);
    fs.writeFile(plistPath, plistContent, (err) => {
        if (err) {
            return callback(`Error creating plist: ${err}`);
        }
        callback(null, plistPath);
    });
}


const uuidHTML = (uuid, device) => {
    return `
    <html></html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Device Info</title>
    <style>
        body {
            background-color: #121212;
            color: #fff;
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 0;
            font-family: Arial, sans-serif;
            text-align: center;
        }

        h1 {
            font-size: 24px;
            margin-bottom: 20px;
        }

        p {
            font-size: 20px;
            margin-bottom: 30px;
        }

        .copy {
            padding: 10px 20px;
            background-color: #1e88e5;
            color: white;
            border-radius: 5px;
            cursor: pointer;
            font-size: 18px;
            width: 100px;
            margin: 0 auto;
            transition: background-color 0.3s ease;
        }

        .copy:hover {
            background-color: #1565c0;
        }
        .container {
            background-color: #242424;
            margin: 0 2em;
            border-radius: 2em;
            padding: 2em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>UUID của bạn là:</h1>
        <p>${uuid}</p>
        <div id="copy" class="copy">Copy</div>
        <p>Copy UDID Xong ra gửi cho mình nhé</p>
    </div>
    <script>
        document.getElementById('copy').addEventListener('click', function (e) {
                e.preventDefault();
                navigator.clipboard.writeText("${uuid}");
                alert('Copied to clipboard');
            });
    </script>
</body>
</html>
    `
}
