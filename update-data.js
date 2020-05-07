const fetch = require('node-fetch');
const fs = require('fs');

function write(relativePath, content) {
    fs.writeFile(relativePath, content, function(err) {
        if(err) {
            console.log(err);
            process.exit(1); // Prevent build if disk write fails
        }
    }); 
}

async function callbackRtEstimate(response) {
    response.text()
    .then((text) => {
        const splitted = text.split(/\r?\n/)
        const lastLine = splitted[splitted.length-2]
        const lastRtEstimateValue = Number.parseFloat(lastLine.split(',')[1])
        const lastRtEstimateDate = lastLine.split(',')[0]
        console.log('Last Rt estimate:', lastRtEstimateValue, lastRtEstimateDate)
        if (lastRtEstimateValue > 0 && lastRtEstimateValue < 10) {
            write(
                'data/latest_Rt.csv',
                `date,Rt\n${lastRtEstimateDate},${lastRtEstimateValue}`
            )
        } else {
            process.exit(1); // Prevent build if estimate out of bounds.
        }
    })
    .catch(error => {
        console.log(error)
        process.exit(1); // Prevent build if parse fails
    });
}

async function callbackRtPNG(response) {
    response.buffer()
    .then((blob) => {
        write('public/latest_Rt.png', blob)
    })
    .catch(error => {
        console.log(error)
        process.exit(1); // Prevent build if parse fails
    });
}

async function callbackHSConfirmedCasesAndDeaths(response) {
    response.json()
    .then((json) => {
        write("data/latest_hs_cases_and_deaths.json", JSON.stringify(json))
    })
}

async function callbackHSHospitalizations(response) {
    response.json()
    .then((json) => {
        write("data/latest_hs_hospitalizations.json", JSON.stringify(json))
    })
}

async function fetchOrExit(url, callback) {
    return await fetch(url)
    .then((response) => {
        if (!response.ok) {
            console.log(response)
            process.exit(1); // Prevent build if fetch fails
        }
        return response
    })
    .then(function(response) {
        return callback(response)
    })
    .catch(error => {
        console.log(error)
        process.exit(1); // Prevent build if parse fails
    });
}

fetchOrExit("https://coronastoragemyvs.blob.core.windows.net/estimate-rt/latest_Rt.csv", callbackRtEstimate)
fetchOrExit("https://coronastoragemyvs.blob.core.windows.net/estimate-rt/latest_Rt.png", callbackRtPNG)
fetchOrExit("https://w3qa5ydb4l.execute-api.eu-west-1.amazonaws.com/prod/finnishCoronaData/v2", callbackHSConfirmedCasesAndDeaths)
fetchOrExit("https://w3qa5ydb4l.execute-api.eu-west-1.amazonaws.com/prod/finnishCoronaHospitalData", callbackHSHospitalizations)