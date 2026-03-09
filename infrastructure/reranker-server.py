"""Lightweight reranker server with /rerank endpoint (Jina/Cohere compatible)."""

import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from sentence_transformers import CrossEncoder

MODEL_ID = "BAAI/bge-reranker-v2-m3"
PORT = 7997

print(f"Loading model {MODEL_ID}...")
model = CrossEncoder(MODEL_ID)
print(f"Model loaded. Serving on http://0.0.0.0:{PORT}")


class RerankHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/rerank":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))

        query = body["query"]
        documents = body["documents"]
        top_n = body.get("top_n", len(documents))

        pairs = [(query, doc) for doc in documents]
        scores = model.predict(pairs).tolist()

        results = sorted(
            [{"index": i, "relevance_score": s} for i, s in enumerate(scores)],
            key=lambda x: x["relevance_score"],
            reverse=True,
        )[:top_n]

        response = {
            "results": results,
            "model": MODEL_ID,
            "usage": {"total_tokens": 0},
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        pass  # suppress per-request logging


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", PORT), RerankHandler).serve_forever()
