// A stand-in for Firecrawl's HTTP API (POST /v2/scrape, POST /v2/parse), serving the captured
// grant pages and documents in tests/fixtures/grant-draft/. The app's Firecrawl SDK reads
// FIRECRAWL_API_URL, so pointing that here keeps every scrape local and free:
//   node scripts/firecrawl-dev-mock.mjs 4020
//   FIRECRAWL_API_URL=http://127.0.0.1:4020 FIRECRAWL_API_KEY=fc-mock npx next dev -p 3001
// tests/grant-applications.test.ts starts it in-process with startFirecrawlMock().
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "grant-draft");

// Every fixture, by the URL it was captured from (and the URL the grant row points at).
function loadFixtures() {
  const byUrl = new Map();
  for (const name of readdirSync(DIR)) {
    if (!name.endsWith(".json")) continue;
    const { _comment, ...doc } = JSON.parse(readFileSync(join(DIR, name), "utf8"));
    byUrl.set(doc.metadata.sourceURL, doc);
  }
  // The GMS link redirects to its sign-in page, as it does live.
  byUrl.set(
    "https://secure.calrecycle.ca.gov/Grants/",
    byUrl.get("https://secure.calrecycle.ca.gov/Grants/SignIn.aspx?ReturnUrl=%2fGrants%2f")
  );
  return byUrl;
}

// The upload fallback: whatever file arrives, its parsed text is the SB 1 proposal template.
const UPLOAD_FIXTURE =
  "https://opc.ca.gov/wp-content/uploads/2023/12/SB1-Track1-Proposal-Template.docx";

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

/**
 * Starts the mock. `requests` records each call: { path, url, options, filename }. A URL added
 * to `slow` answers as Firecrawl does when a big PDF outlives the request: a 408 whose details
 * say the job is still processing, with a Retry-After.
 */
export async function startFirecrawlMock({ port = 0, host = "127.0.0.1" } = {}) {
  const byUrl = loadFixtures();
  const requests = [];
  const slow = new Set();
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.headers.authorization?.startsWith("Bearer ") !== true) {
      return send(401, { success: false, error: "Unauthorized: missing API key" });
    }
    if (req.method === "POST" && req.url === "/v2/scrape") {
      const { url, ...options } = JSON.parse(body.toString("utf8"));
      requests.push({ path: "/v2/scrape", url, options });
      if (slow.has(url)) {
        res.setHeader("Retry-After", "30");
        return send(408, {
          success: false,
          error: "Scrape timed out; the document is still processing.",
          details: { state: "processing_continues" }
        });
      }
      const doc = byUrl.get(url);
      if (!doc) {
        return send(200, {
          success: true,
          data: { markdown: "", metadata: { statusCode: 404, sourceURL: url, error: "Not Found" } }
        });
      }
      return send(200, { success: true, data: doc });
    }
    if (req.method === "POST" && req.url === "/v2/parse") {
      const text = body.toString("latin1");
      const filename = /filename="([^"]*)"/.exec(text)?.[1] ?? null;
      const optionsText = /name="options"\r\n\r\n([^\r]*)\r\n/.exec(text)?.[1];
      requests.push({
        path: "/v2/parse",
        filename,
        options: optionsText ? JSON.parse(optionsText) : null
      });
      const doc = byUrl.get(UPLOAD_FIXTURE);
      return send(200, {
        success: true,
        data: { ...doc, metadata: { ...doc.metadata, sourceURL: filename, title: filename } }
      });
    }
    send(404, { success: false, error: `No mock for ${req.method} ${req.url}` });
  });
  await new Promise((resolve) => server.listen(port, host, resolve));
  const { port: bound } = server.address();
  return {
    url: `http://${host}:${bound}`,
    requests,
    slow,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mock = await startFirecrawlMock({ port: Number(process.argv[2] ?? 4020) });
  console.log(`Firecrawl mock on ${mock.url}`);
}
