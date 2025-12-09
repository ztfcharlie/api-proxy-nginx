const crypto = require('crypto');

class AwsSigner {
    static sign(options) {
        const {
            method = 'POST',
            path = '/',
            headers = {},
            body = '',
            region,
            accessKeyId,
            secretAccessKey,
            service = 'bedrock'
        } = options;

        const host = headers['host'];
        const datetime = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
        const date = datetime.substr(0, 8); // YYYYMMDD

        // 1. Canonical Request
        const canonicalUri = path;
        const canonicalQuerystring = '';
        
        // Ensure headers are lowercased and sorted
        const sortedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
        let canonicalHeaders = '';
        let signedHeaders = '';
        
        sortedHeaderKeys.forEach(k => {
            canonicalHeaders += `${k}:${headers[k].trim()}\n`;
            signedHeaders += `${k};`;
        });
        // Remove trailing semicolon
        signedHeaders = signedHeaders.slice(0, -1);

        const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
        
        const canonicalRequest = [
            method,
            canonicalUri,
            canonicalQuerystring,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join('\n');

        // 2. String to Sign
        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${date}/${region}/${service}/aws4_request`;
        const stringToSign = [
            algorithm,
            datetime,
            credentialScope,
            crypto.createHash('sha256').update(canonicalRequest).digest('hex')
        ].join('\n');

        // 3. Calculate Signature
        const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(date).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

        // 4. Return Authorization Header
        return `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    }
}

module.exports = AwsSigner;
