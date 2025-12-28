# Traefik 证书目录

请将 TLS 证书文件放置到此目录：
- origin.crt - 证书文件
- origin.key - 私钥文件

如果使用 Cloudflare，可以从 Cloudflare Dashboard 生成 Origin Certificate：
1. 登录 Cloudflare Dashboard
2. 选择域名 → SSL/TLS → Origin Server
3. Create Certificate
4. 下载 origin.crt 和 origin.key
