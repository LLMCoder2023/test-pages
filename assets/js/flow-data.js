/* ==========================================================================
   Flowchart definitions
   --------------------------------------------------------------------------
   node:  { id, type, x, y, w?, h?, label, sub?, info: { desc, owner, avg, log } }
          type: "terminal" | "process" | "decision" | "success" | "error"
          x / y are the CENTER of the node in viewBox units.
   edge:  { from, to, label?, p?, via?: [[x,y],...], labelAt?: 0..1, kind?: "no" }
          p = probability weight used when the source is a decision.
   Add a new object to window.FLOWS and a tab appears automatically.
   ========================================================================== */
window.FLOWS = [
  {
    id: "pipeline",
    title: "CI/CD pipeline",
    viewBox: [0, 0, 1060, 560],
    start: "push",
    nodes: [
      { id: "push", type: "terminal", x: 80, y: 280, w: 120, label: "git push", sub: "trigger",
        info: { desc: "A developer pushes commits to the main branch, which triggers the workflow.", owner: "Developer", avg: "—", log: "Webhook received: push to main" } },
      { id: "build", type: "process", x: 250, y: 280, w: 130, label: "Build", sub: "compile · bundle",
        info: { desc: "Installs dependencies, compiles sources and produces versioned artifacts.", owner: "CI runner", avg: "1m 42s", log: "Build finished, artifacts uploaded" } },
      { id: "test", type: "process", x: 420, y: 280, w: 130, label: "Test", sub: "unit · e2e",
        info: { desc: "Runs the unit, integration and browser test suites in parallel shards.", owner: "CI runner", avg: "3m 10s", log: "Test suites executed" } },
      { id: "pass", type: "decision", x: 590, y: 280, w: 150, h: 96, label: "Tests pass?",
        info: { desc: "Gate: every required check must be green to continue.", owner: "Branch protection", avg: "instant", log: "Evaluating check results" } },
      { id: "fix", type: "error", x: 590, y: 460, w: 140, label: "Fix & commit", sub: "red build",
        info: { desc: "A failing check notifies the author, who pushes a fix. The pipeline starts again at Build.", owner: "Developer", avg: "~20m", log: "Failure reported, fix pushed" } },
      { id: "stage", type: "process", x: 770, y: 280, w: 140, label: "Deploy staging", sub: "blue/green",
        info: { desc: "Ships the artifact to the staging environment behind a blue/green switch.", owner: "Deploy bot", avg: "55s", log: "Staging deploy healthy" } },
      { id: "approve", type: "decision", x: 950, y: 280, w: 150, h: 96, label: "Approved?",
        info: { desc: "A release manager reviews staging and approves or rejects promotion.", owner: "Release manager", avg: "~10m", log: "Awaiting approval" } },
      { id: "prod", type: "success", x: 950, y: 100, w: 140, label: "Production", sub: "100% rollout",
        info: { desc: "Promotes the build to production with a progressive rollout and auto-rollback.", owner: "Deploy bot", avg: "2m 05s", log: "Released to production 🎉" } },
    ],
    edges: [
      { from: "push", to: "build" },
      { from: "build", to: "test" },
      { from: "test", to: "pass" },
      { from: "pass", to: "stage", label: "yes", p: 0.65 },
      { from: "pass", to: "fix", label: "no", p: 0.35, kind: "no" },
      { from: "fix", to: "build", via: [[250, 460]], label: "retry", labelAt: 0.4 },
      { from: "stage", to: "approve" },
      { from: "approve", to: "prod", label: "yes", p: 0.75 },
      { from: "approve", to: "fix", via: [[950, 460]], label: "no", p: 0.25, kind: "no", labelAt: 0.25 },
    ],
  },
  {
    id: "request",
    title: "Request lifecycle",
    viewBox: [0, 0, 1120, 560],
    start: "client",
    nodes: [
      { id: "client", type: "terminal", x: 90, y: 280, w: 130, label: "Client", sub: "HTTPS GET",
        info: { desc: "A browser or app sends a request to the public endpoint.", owner: "User agent", avg: "—", log: "GET /api/orders/42" } },
      { id: "cdn", type: "process", x: 260, y: 280, w: 130, label: "CDN edge", sub: "TLS · WAF",
        info: { desc: "Terminates TLS at the nearest edge location and applies firewall rules.", owner: "Edge network", avg: "4 ms", log: "Edge POP accepted request" } },
      { id: "hit", type: "decision", x: 440, y: 280, w: 150, h: 96, label: "Cache hit?",
        info: { desc: "Looks up the response in the edge cache using the request's cache key.", owner: "Edge cache", avg: "<1 ms", log: "Cache lookup" } },
      { id: "cached", type: "success", x: 440, y: 100, w: 140, label: "Serve cached", sub: "age < ttl",
        info: { desc: "Returns the stored response straight from the edge, without contacting the origin.", owner: "Edge cache", avg: "2 ms", log: "HIT, served from edge" } },
      { id: "gw", type: "process", x: 620, y: 280, w: 140, label: "API gateway", sub: "rate limit",
        info: { desc: "Routes to the right service, enforces rate limits and adds tracing headers.", owner: "Platform team", avg: "6 ms", log: "Routed to orders-svc" } },
      { id: "auth", type: "decision", x: 800, y: 280, w: 150, h: 96, label: "Authorized?",
        info: { desc: "Validates the bearer token signature, expiry and scopes.", owner: "Auth service", avg: "3 ms", log: "Verifying JWT" } },
      { id: "deny", type: "error", x: 800, y: 460, w: 150, label: "401 Unauthorized", sub: "end",
        info: { desc: "Rejects the request with WWW-Authenticate details. Nothing downstream runs.", owner: "Gateway", avg: "1 ms", log: "Rejected: token expired" } },
      { id: "svc", type: "process", x: 980, y: 280, w: 130, label: "Service", sub: "orders-svc",
        info: { desc: "Runs the business logic and loads its data.", owner: "Orders team", avg: "18 ms", log: "Handler invoked" } },
      { id: "db", type: "process", x: 980, y: 460, w: 130, label: "Database", sub: "read replica",
        info: { desc: "Runs an indexed read on a replica and returns the matching rows.", owner: "Data platform", avg: "9 ms", log: "SELECT … 1 row" } },
      { id: "resp", type: "terminal", x: 980, y: 100, w: 130, label: "200 OK", sub: "JSON",
        info: { desc: "Serializes the response, sets cache headers and streams it to the client.", owner: "Service", avg: "1 ms", log: "Response sent" } },
    ],
    edges: [
      { from: "client", to: "cdn" },
      { from: "cdn", to: "hit" },
      { from: "hit", to: "cached", label: "yes", p: 0.4 },
      { from: "hit", to: "gw", label: "no", p: 0.6, kind: "no" },
      { from: "cached", to: "resp" },
      { from: "gw", to: "auth" },
      { from: "auth", to: "svc", label: "yes", p: 0.8 },
      { from: "auth", to: "deny", label: "no", p: 0.2, kind: "no" },
      { from: "svc", to: "db" },
      { from: "db", to: "resp", via: [[1085, 460], [1085, 100]], labelAt: 0.5 },
    ],
  },
];
