<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/079601da-4428-4915-b4a1-c4305d08a68c

## Run Locally

The project consists of two web applications:
- **`web`**: The main user-facing web app.
- **`admin`**: The administrator dashboard web app.

### Prerequisites:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm or yarn

### Steps to Run:

1. **Setup Environment Variables**:
   Create a `.env` file in either the `web` or `admin` directories (or both) as needed based on `.env.example`.

2. **Install dependencies and start development server**:

   For the main web app:
   ```bash
   cd web
   npm install
   npm run dev
   ```

   For the admin dashboard:
   ```bash
   cd admin
   npm install
   npm run dev
   ```

3. Open the local address shown in your terminal (typically `http://localhost:5173`) in your browser.

