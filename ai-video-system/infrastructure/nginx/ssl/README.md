# SSL Certificates

This directory is intended to store SSL certificates for HTTPS configuration.

## Required Files

- `cert.pem` - SSL certificate file
- `key.pem` - SSL private key file

## Development Setup

For development purposes, you can generate self-signed certificates:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem \
  -out cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

## Production Setup

For production, use certificates from a trusted certificate authority like Let's Encrypt:

```bash
certbot certonly --standalone -d yourdomain.com
```

Then copy the certificates to this directory:

```bash
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem key.pem
```

## Security Notes

- Ensure the private key file has restricted permissions (600)
- Keep backups of your certificates in a secure location
- Monitor certificate expiration dates and renew as needed