export class UFState {
  constructor(susceptible, inf, hospitalized, icu, recovered, fatalities) {
    this['susceptible'] = susceptible
    this['infected'] = inf
    this['hospitalized'] = hospitalized
    this['icu'] = icu
    this['recovered'] = recovered
    this['fatalities'] = fatalities
  }
}

export function getDefaultStateMeta() {
    return [
        {
        'key': 'susceptible',
        'tooltip_title': 'Susceptible',
        'tooltip_desc': 'Population not immune to the disease',
        'checkable': false,
        'checked': false,
        'color': '#c8ffba',
        },
        {
        'key': 'infected',
        'tooltip_title': 'Infected',
        'tooltip_desc': 'Active infections (incl. incubating, undiagnosed) (excl. hosp, icu)',
        'checkable': true,
        'checked': true,
        'color': '#f0027f',
        },
        {
        'key': 'hospitalized',
        'tooltip_title': 'Hospitalized',
        'tooltip_desc': 'Active hospitalizations (excluding ICU)',
        'checkable': true,
        'checked': true,
        'color': '#8da0cb'
        },
        {
        'key': 'icu',
        'tooltip_title': 'ICU',
        'tooltip_desc': 'Patients in intensive care, active',
        'checkable': true,
        'checked': true,
        'color': '#386cb0',
        },
        {
        'key': 'recovered',
        'tooltip_title': 'Recovered',
        'tooltip_desc': 'Number of full recoveries, cumulative',
        'checkable': true,
        'checked': false,
        'color': '#4daf4a',
        },
        {
        'key': 'fatalities',
        'tooltip_title': 'Fatalities',
        'tooltip_desc': 'Number of deaths, cumulative',
        'checkable': true,
        'checked': true,
        'color': "#000000",
        },
    ]
}