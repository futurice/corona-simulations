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

- The `master` branch is automatically built and deployed every 6 hours, using [GitHub workflows and Netlify build hooks](https://ericjinks.com/blog/2019/netlify-scheduled-build/).
- In addition, commits trigger a production deployment.

## A word about architecture

#### For context, a word about epidemic models

Epidemic models can be divided into compartmentalized models and agent-based models. Generally speaking, agent-based models are often stochastic and simulate individual agents ("Jack meets... *rolls dice*... 6 people today") whereas compartmentalized models are often deterministic and simulate groups of people rather than individuals ("today we have 1000 infected... *increases by 10%*... tomorrow we have 1100 infected). Agent-based models are often simple on math side, but require significant efforts in software engineering and computational power. Compartmentalized models require more math (typically differential equations), but they are simple to write in terms of software engineering, and they don't require a lot of computational power. Agent-based models are closer to reality, which makes them easier to extend to different use cases. Corosim implements a compartmentalized model.

#### About that architecture

Corosim is designed as a fully static web app. Data is updated at build-time every 6 hours. Computation for the model occurs live in the browser. Benefits of these design choices include:
- Immediate results. End users can tune parameters and action markers and see the results immediately. Users don't have to send a formal request to a silo "can you please run this simulation for us" and wait 1 week for the silo to produce a PDF describing results.
- Infinitely scalable. This software will work just fine no matter how many simultaneous users you get.
- Costs $0 to host.
- Does not break on its own (Even if the outside APIs break, Corosim will not break, because data is fetched at build-time rather than run-time)

## Want to fork this repo and customize it for your country?

Here are roughly the things you need to change to customize this for your country:
- Identify a data source for your country. You're looking for these numbers:
    - confirmed cases by day
    - OPTIONAL: confirmed deaths by day
    - OPTIONAL: active hospitalizations in regular ward, by day
    - OPTIONAL: active hospitalizations in icu, by day
    - OPTIONAL: new hospitalizations (as opposed to active)
    - OPTIONAL: recoveries by day
- Write parsing for the data
    - take inspiration from [update-data.js](update-data.js)
- Deal with any country-specific peculiarities related to data collection / reporting
    - some of these peculiarities are dealt with when parsing data, in [update-data.js](update-data.js)
    - and some are dealt with when creating historical estimates, in [src/models/historical_estimates.js](src/models/historical_estimates.js)
- Go through parameters and change default values for any country-specific parameters
    - most parameters are in [src/paramConfig.json](src/paramConfig.json)
    - R0 is a special case, because it is estimated from data, rather than fixed default value
- Change population count N
    - you'll find that in [src/App.svelte](src/App.svelte)
- Change the flag and texts.
    - also in [src/App.svelte](src/App.svelte)
- Set up hosting
    - I recommend Netlify.
- Set up a process to rebuild and deploy every x hours (for data updates)
    - I recommend [GitHub workflows and Netlify build hooks](https://ericjinks.com/blog/2019/netlify-scheduled-build/).