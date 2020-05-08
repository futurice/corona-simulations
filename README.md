# Corosim

Deployed & explained here:

https://corosim.fi/

## Initial setup

```bash
npm install
```

## Development

```bash
npm run update-data
npm run dev
```

Navigate to [localhost:5000](http://localhost:5000). You should see your app running.
Edit a component file in `src`, save it, and reload the page to see your changes.
There are some issues with hot reloading in the development environment; if you
find yourself needing to hard refresh to see changes, try developing on Chrome
with devtools open and "disable cache" checked.

## Production build

```bash
npm run build
```

Production build begins by fetching the latest data. If successful, it proceeds to run a regular Svelte production build.

## Production deployment

- The `master` branch is automatically built and deployed every 3 hours, using [GitHub workflows and Netlify build hooks](https://ericjinks.com/blog/2019/netlify-scheduled-build/).
- In addition, commits trigger a production deployment.
- Note that there are currently **no tests**, so you can break the production build! If that happens, keep calm and rollback.
