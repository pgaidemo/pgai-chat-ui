export function loginPage(error: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign In · PointGuard AI</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    background: #2F1472;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 1.5rem;
  }
  .card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.35);
    width: 100%;
    max-width: 380px;
    overflow: hidden;
  }
  .logo-strip {
    background: #2F1472;
    padding: 1.6rem 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 3px solid #DA3D0C;
  }
  .logo-strip img {
    height: 2.4rem;
    width: auto;
    display: block;
  }
  .form-body {
    padding: 2rem 2rem 2.4rem;
  }
  h1 {
    font-size: 1.15rem;
    font-weight: 700;
    color: #2F1472;
    margin-bottom: 0.25rem;
    letter-spacing: -0.01em;
  }
  .subtitle {
    font-size: 0.82rem;
    color: #888;
    margin-bottom: 1.6rem;
  }
  label {
    display: block;
    font-size: 0.78rem;
    font-weight: 600;
    color: #444;
    margin-bottom: 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  input[type=text], input[type=password] {
    width: 100%;
    padding: 0.65rem 0.85rem;
    border: 1.5px solid #ddd;
    border-radius: 7px;
    font-size: 0.95rem;
    color: #222;
    background: #fafafa;
    margin-bottom: 1.1rem;
    transition: border-color 0.15s;
    outline: none;
  }
  input[type=text]:focus, input[type=password]:focus {
    border-color: #2F1472;
    background: #fff;
  }
  button[type=submit] {
    width: 100%;
    padding: 0.75rem;
    background: #DA3D0C;
    color: #fff;
    border: none;
    border-radius: 7px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.01em;
    transition: background 0.15s;
  }
  button[type=submit]:hover { background: #bf3409; }
  button[type=submit]:active { background: #a62d07; }
  .error-msg {
    display: ${error ? "flex" : "none"};
    align-items: center;
    gap: 0.5rem;
    background: #fff1f0;
    border: 1px solid #ffa39e;
    border-radius: 7px;
    padding: 0.6rem 0.85rem;
    font-size: 0.85rem;
    color: #cf1322;
    margin-bottom: 1.1rem;
  }
  .footer {
    text-align: center;
    font-size: 0.75rem;
    color: rgba(255,255,255,0.5);
    margin-top: 1.4rem;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo-strip">
    <img src="/pg-logo-white-red.svg" alt="PointGuard AI">
  </div>
  <div class="form-body">
    <h1>Agent Security Console</h1>
    <p class="subtitle">Sign in to continue</p>
    <div class="error-msg">
      <span>&#9888;</span> Invalid username or password
    </div>
    <form method="POST" action="/auth" autocomplete="on">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
    </form>
  </div>
</div>
<div class="footer">PointGuard AI &middot; Agent Security Console</div>
</body>
</html>`;
}
