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

Commits to `master` branch are automatically deployed to Netlify. Note that there are currently **no tests**, so you can break the production build! If that happens, keep calm and rollback.

#### Updating default parameters

You can edit [default_parameters.js](default_parameters.js) right here on GitHub.

#### Updating historical data

Historical estimates are currently worked on in [this spreadsheet](https://docs.google.com/spreadsheets/d/1Yt39KNx0AHYthLZR8acUpIZQwMm4WHeU8A2qIRBdoYI/edit?usp=sharing).

In order to deploy updated estimates, export the spreadsheet as a `.csv` and copy it over to [data/hardcodedHistoricalEstimates.csv](data/hardcodedHistoricalEstimates.csv).
