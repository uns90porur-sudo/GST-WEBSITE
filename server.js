const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
    // Add CORS headers so the local file:/// website can call the API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // Endpoint to list files in a manually specified folder
    if (pathname === '/api/list') {
        const targetPath = parsedUrl.query.path;
        
        if (!targetPath) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Path required' }));
        }

        try {
            if (!fs.existsSync(targetPath)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ files: [], message: 'Folder path does not exist on disk.' }));
            }
            
            // Explicitly support Node v6 by not using withFileTypes
            const items = fs.readdirSync(targetPath);
            const files = [];
            
            for (const item of items) {
                const itemPath = path.join(targetPath, item);
                let stat;
                try {
                    stat = fs.statSync(itemPath);
                } catch(e) { continue; }
                
                if (stat.isFile()) {
                    files.push({
                        name: item,
                        path: encodeURIComponent(itemPath),
                        size: stat.size,
                        isDirectory: false
                    });
                } else if (stat.isDirectory()) {
                    files.push({
                        name: item,
                        path: encodeURIComponent(itemPath),
                        size: 0,
                        isDirectory: true
                    });
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                folderName: path.basename(targetPath),
                folderPath: targetPath,
                files: files
            }));
            
        } catch (e) {
            res.writeHead(500);
            return res.end(JSON.stringify({ error: 'Error reading directory. Check permissions or path format.' }));
        }
    }

    // Endpoint to securely download/view the selected file
    if (pathname === '/api/download') {
        const filePath = decodeURIComponent(parsedUrl.query.path);
        
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
            
            // Set headers for inline viewing if it's a PDF or text, otherwise attachment download
            res.writeHead(200, { 
                'Content-Type': mimeType,
                'Content-Disposition': `inline; filename="${path.basename(filePath)}"`
            });
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            return;
        } else {
            res.writeHead(404);
            return res.end('File not found');
        }
    }

    // Endpoint to securely open the folder natively in Windows Explorer
    if (pathname === '/api/open-folder') {
        const targetPath = decodeURIComponent(parsedUrl.query.path);
        if (targetPath) {
            const { exec } = require('child_process');
            // Safe native execution for Windows
            exec(`explorer "${targetPath.replace(/\//g, '\\')}"`);
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true }));
        }
        res.writeHead(400);
        return res.end('Path missing');
    }

    // Mock Endpoint for Real-Time GST Verification
    if (pathname === '/api/verify-gst') {
        const gstin = parsedUrl.query.gstin;
        if (gstin) {
            setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: true,
                    data: {
                        gstin: gstin,
                        legalName: "JVS-S. SINTHUJA Private Limited",
                        tradeName: "JVS ENTERPRISES",
                        status: "Active",
                        registrationDate: "15/07/2017",
                        taxpayerType: "Regular",
                        constitution: "Proprietorship",
                        lastReturnFiled: "GSTR-3B (May 2026)"
                    }
                }));
            }, 1000); // 1.0s delay to simulate live fetch
            return;
        }
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'GSTIN required' }));
    }

    // Default fallback
    res.writeHead(404);
    res.end('Not found');
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`TaxCore File Server running at http://localhost:${PORT}/`);
    console.log(`Ready to serve manual folder paths.`);
});
