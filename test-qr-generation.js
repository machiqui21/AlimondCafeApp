const QRCode = require('qrcode');

async function testQRCode() {
    try {
        const qrData = `Order ID: 58\nAmount: ₱140.00\nAccount: 09265363860`;
        const qrCodeDataUrl = await QRCode.toDataURL(qrData);
        
        console.log('QR Code generated successfully!');
        console.log('Type:', typeof qrCodeDataUrl);
        console.log('Length:', qrCodeDataUrl ? qrCodeDataUrl.length : 0);
        console.log('First 100 chars:', qrCodeDataUrl ? qrCodeDataUrl.substring(0, 100) : 'NULL');
    } catch (error) {
        console.error('Error generating QR code:', error);
    }
}

testQRCode();
