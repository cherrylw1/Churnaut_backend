console.log('Environment variable keys:', Object.keys(process.env).sort());
if (process.env.ENCRYPTION_KEY) {
  console.log('ENCRYPTION_KEY is set! Length:', process.env.ENCRYPTION_KEY.length);
} else {
  console.log('ENCRYPTION_KEY is not set.');
}
