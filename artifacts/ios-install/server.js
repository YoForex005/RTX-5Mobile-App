const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 8787);
const root = __dirname;

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
  const filePath =
    requestUrl.pathname === "/"
      ? path.join(root, "index.html")
      : path.join(root, requestUrl.pathname);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(content);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`RTX5 iOS installer page: http://localhost:${port}`);
});
