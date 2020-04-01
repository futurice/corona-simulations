# Corona Simulations

https://futu-corosim-proto.netlify.com/

Note that this is WIP that was quickly hacked together to respond to the crisis.

## Initial setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Navigate to [localhost:5000](http://localhost:5000). You should see your app running. Edit a component file in `src`, save it, and reload the page to see your changes.

By default, the server will only respond to requests from localhost. To allow connections from other computers, edit the `sirv` commands in package.json to include the option `--host 0.0.0.0`.

## Production build

```bash
npm run build
```

## Production deployment

Commits to `master` branch are automatically deployed to Netlify.
