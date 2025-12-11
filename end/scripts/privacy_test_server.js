const http = require('http');

const port = 3000;

const server = http.createServer((req, res) => {
    const info = {
        message: "Privacy Check - Headers Received by Backend",
        timestamp: new Date().toISOString(),
        client_ip: req.socket.remoteAddress,
        client_family: req.socket.remoteFamily,
        headers: req.headers
    };

    console.log("--- Request Received ---");
    console.log(`IP: ${info.client_ip}`);
    console.log("Headers:", JSON.stringify(info.headers, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info, null, 2));
});

server.listen(port, () => {
    console.log(`Privacy test server listening on port ${port}`);
    console.log(`This server will echo back the headers it receives.`);
});
