<script>
  
  // Libraries
  import { scaleLinear } from "d3-scale";
  import { onMount } from 'svelte';
  import { selectAll } from 'd3-selection'
  import { drag } from 'd3-drag';
  import queryString from "query-string";
  import { format } from 'd3-format';
  import { event } from 'd3-selection';
  import Icon from 'svelte-awesome';
  import { search, plus, exclamationCircle, times, question } from 'svelte-awesome/icons';
  import katex from 'katex';

  // Custom Svelte components
  import Chart from './components/Chart.svelte';
  import ChartCompanion from './components/ChartCompanion.svelte';
  import Checkbox from './components/Checkbox.svelte';
  import Arrow from './components/Arrow.svelte';
  import HistoryMarker from './components/HistoryMarker.svelte';
  import ActionMarker from './components/ActionMarker.svelte';
  import ParameterKnob from './components/ParameterKnob.svelte';
  import Collapsible from './components/Collapsible.svelte';

  // Custom utilities
  import { ActionMarkerData, AM_DAY } from './action_marker_data.js';
  import { UFState, getDefaultStateMeta } from './user_facing_states.js';
  import { get_solution_from_gohs_seir_ode, goh_default_action_markers } from './models/gohs_seir_ode.js';
  import { map_berkeley_states_into_UFStates, parse_berkeley, get_berkeley_action_markers } from './models/berkeley_abm.js';
  import { createHistoricalEstimates } from './models/historical_estimates.js';
  import { getDate, addDays, formatCount, formatDelta, MODEL_GOH, MODEL_CUSTOM, stylizeExpressions } from './utils.js';
  import { math_inline, math_display, padding } from './utils.js';

  // Static data imports
  import paramConfig from './paramConfig.json';
  import hs_parsed from '../data/hs_parsed.json';
  import latestRtEstimate from './../data/latest_Rt.csv';

  function range(n){
    return Array(n).fill().map((_, i) => i);
  }

  function get_R0_from_Rt(Rt, goh_states_fin) {
    const prop_susceptible = goh_states_fin[goh_states_fin.length-1][0]
    return parseFloat((Rt / prop_susceptible).toFixed(2))
  }

  // Motivation: when we zoom out, Chart needs every nth datapoint from P.
  function get_every_nth(P, n) {
    var arr = []
    for (var i=0; i<P.length; i+=n) {
      arr.push(P[i])
    }
    return arr
  }

  function replaceFuturiceFromTextWithLogo(text) {
    return text.replace('Futurice', '<img alt="Futurice" style="vertical-align:middle; padding: 0px 5px 5px 5px;" width="80" src="futurice.png">')
  }

  let collapsed = {}

  let display_scenario_dropdown = false
  let custom_scenario_url_prefix = 'https://coronastoragemyvs.blob.core.windows.net/coviducb/'
  let custom_scenario_url_postfix = '-outcome_1.json'

  let oneLineAttribution = `Corosim was created by <a href="https://futurice.com/" style="color: #009f77;">Futurice</a> on top of <a href="https://gabgoh.github.io/">Gabriel Goh's</a> <a href="https://gabgoh.github.io/COVID/index.html">Epidemic Calculator</a>.`

  // R0 paramConfig is stored at a separate object because its default value is updated by a reactive function.
  // Do not refactor into paramConfig.
  let paramConfigR0 = {
    description: `Basic Reproduction Number {R0}`,
    isDefaultValueAutomaticallyGeneratedFromData: true,
    defaultValue: 2, // Will be overwritten by a reactive function.
    minValue: 0.01,
    maxValue: 5,
    stepValue: 0.01,
    unitsDescriptor: '',
    isInteger: false,
    isPercentage: false,
    longformDescription: `Informally, {R0} describes how easily a virus can spread in a population.
                          Note that {R0} is not just a property of the virus: the behavior of individuals
                          within a population also affects how easily a virus can spread. To be specific,
                          {R0} describes the number of new infections expected to be caused by a typical infected
                          person within a population <i>where everyone is susceptible to the disease</i>.
                          For example, if ${math_inline('\\mathcal{R}_0=2')}, then one infected person
                          would be expected to infect 2 other people (on average, if everyone in the
                          population was susceptible).`,
    longformDoNotConfuseWith: `{Rt}, the <i>effective</i> reproduction number, describes the same thing,
                               except for the assumption regarding susceptible population. {Rt} describes
                               how many new infections are <i>effectively</i> caused by a typical infected
                               person within a population (without assuming that everyone is susceptible to
                               the disease). In the beginning of the epidemic, both {Rt} and {R0} are
                               very close to each other. However, as more and more people have had the disease,
                               they have (presumably) developed an immunity towards it. This makes it increasingly
                               harder for the virus to spread, causing {Rt} to diverge lower from {R0}.
                               `,
    longformEffects: "",
    longformDefaultValueJustification: `The default value for {R0} is estimated from 7 days of confirmed case counts.
                                        This default value is not hardcoded, it is updated daily as new data comes in.
                                        Because of delays in recording new cases, we do not use the most recent 7 days:
                                        we exclude the most recent 5 days and then take the next 7 days.<br>
                                        
                                        <img src="latest_Rt.png" alt="Rt estimates over time" title="Rt estimates over time"/><br>

                                        There are many methods to estimate reproduction numbers from data. We use a Bayesian
                                        approach described by <a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0002185">Bettencourt
                                        & Ribeiro</a> in their 2008 paper "Real Time Bayesian Estimation of the Epidemic Potential
                                        of Emerging Infectious Diseases"</a>, which was
                                        <a href="http://systrom.com/blog/the-metric-we-need-to-manage-covid-19/">adapted and modified</a>
                                        for the COVID-19 epidemic by Kevin Systrom. This method gives us an estimate of {Rt},
                                        which we convert to {R0} by considering our estimate of the proportion of susceptible population p:
                                        <br><br>
                                        ${math_inline('\\mathcal{R}_t = \\mathcal{R}_0 * p')}
                                        
                                        <br><br>
                                        If you would like to double-check our computations on Finnish data, see
                                        <a href="https://github.com/futurice/covid-19-R_t-estimating/blob/master/finland.ipynb">this notebook</a>.
                                        
                                        `

  }

  function setDefaultParamsR0(latestR0EstimateValue, latestRtEstimateDate) {
    paramConfigR0.defaultValue = latestR0EstimateValue
  }


  $: N                 = 5538328 // 2020 Finnish population count
  $: logN              = Math.log(N)
  $: I0                = 1
  $: undetected_infections = paramConfig["undetected_infections"].defaultValue
  $: unrecorded_deaths = paramConfig["unrecorded_deaths"].defaultValue
  $: D_incbation       = paramConfig["days_from_incubation_to_infectious"].defaultValue
  $: D_infectious      = paramConfig["days_from_infectious_to_not_infectious"].defaultValue
  $: D_recovery_mild   = paramConfig["days_in_mild_recovering_state"].defaultValue
  $: D_hospital        = paramConfig["days_in_hospital"].defaultValue
  $: CFR               = paramConfig["fatality_rate"].defaultValue
  $: Time              = 220
  $: Xmax              = 110000
  $: dt                = 2
  $: P_SEVERE          = paramConfig["hospitalization_rate"].defaultValue
  $: P_ICU             = paramConfig["icu_rate_from_hospitalized"].defaultValue
  $: icuCapacity       = paramConfig["icu_capacity"].defaultValue

  function toggleZoomStates() {
    dt *= 2
    if (dt > 4) dt = 1
  }

  function closePopup() {
    popupHTML = ''
  }

  function addActionMarker() {
    actionMarkers[selectedModel].push(new ActionMarkerData(99*dt, undefined, -0.1, true))
    actionMarkers = actionMarkers // Trigger re-render
  }

  function getlastHistoricBar(P_all_historical, dt) {
    if (!P_all_historical) return 0
    return get_every_nth(P_all_historical, dt).length - 1 // TODO optimize this to be more efficient
  }

  function with_enough_days(P, dt) {
    var augmented = []
    for (var i=0; i<P.length; i++) {
      augmented.push(P[i])
    }
    // If we have too few values, augment with empty so that the Chart renders properly.
    while (augmented.length < 101*dt) {
      augmented.push(new UFState(0,0,0,0,0,0))
    }
    return augmented
  }

  function take_slice_from_beginning(P, dt) {
    var augmented = []
    for (var i=0; i<P.length; i++) {
      augmented.push(P[i])
    }
    // If we have too many values, take desired slice from the beginning.
    augmented = augmented.slice(0, 101*dt)
    return augmented
  }

  function getPmax(P_bars, states) {
    var Pmax = 0
    for (var i=0; i<P_bars.length; i++) {
      const bars = P_bars[i]
      var curr = 0
      for (var j=0; j<states.length; j++) {
        const state = states[j]
        if (state['checked']) {
          const k = state['key']
          curr += P_bars[i][k]
        }
      }
      if (curr > Pmax) {
        Pmax = curr
      }
    }
    return Pmax
  }





  /********************************** Generate state (choose which model to run, run it with user specified parameters, etc.) *********************************/

  function debugHelper([... vars]) {
    if (vars.length == 0) return
    console.log('*** DEBUG ***')
    for (var i=0; i<vars.length; i++) {
      console.log(vars[i])
    }
  }

  function fetchCustomScenarioAsync() {
    customScenarioStatus = 'Fetching data...'
    const url = custom_scenario_url_prefix + customScenarioGUID + custom_scenario_url_postfix
    fetch(url, { 
      method: 'GET'
    })
    .then((response) => {
      if (!response.ok) {
        showUserError(response)
      }
      return response
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(json) {
      parseCustomScenario(json)
    })
    .catch(error => {
      showUserError(error)
    });
  }

  let customScenarioStatus = ''

  function showUserError(thing) {
    customScenarioStatus = 'Error fetching scenario'
    console.log(thing)
  }

  function parseCustomScenario(json) {
    customScenarioStatus = '' // Clear out "Fetching..." message
    P_all_fetched = parse_berkeley(json["scenario_states"], json["scenario_params"], N)
    custom_params = {...json["scenario_params"], ...json["parameters"]}
    actionMarkers = actionMarkerHelper(P_all_historical, custom_params)
  }

  function get_solution(selectedModel, P_all_fetched, actionMarkers, goh_states_fin, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR) {
    if (selectedModel === MODEL_GOH) {
      return get_solution_from_gohs_seir_ode(actionMarkers[selectedModel], goh_states_fin, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR)
    } else if (selectedModel === MODEL_CUSTOM) {
      return P_all_fetched
    } else {
      console.log('Error! getSolution does not have handling for model ', selectedModel)
    }
  }

  function actionMarkerHelper(P_all_historical, custom_params) {
    const m = actionMarkers || {}
    if (!m[MODEL_GOH]) {
      // Action markers for Goh have not been set yet; set to default values.
      m[MODEL_GOH] = goh_default_action_markers(P_all_historical)
    } else {
      // Action markers for Goh have been set, but we may have to adjust them
      // in case historymarker has been moved to the right.
      for (var i=0; i<m[MODEL_GOH].length; i++) {
        const actionMarker = m[MODEL_GOH][i]
        if (actionMarker[AM_DAY] < P_all_historical.length) {
          actionMarker[AM_DAY] = P_all_historical.length
        }
      }
    }
    if (custom_params['0']) {
      m[MODEL_CUSTOM] = get_berkeley_action_markers(P_all_historical.length, custom_params)
    } else if (!m[MODEL_CUSTOM]) {
      m[MODEL_CUSTOM] = []
    }
    return m
  }
  
  let customScenarioGUID   = queryString.parse(location.search).customScenario
  let P_all_fetched   = [] // For "Custom scenario": empty array until we get data.
  let custom_params   = {} // Empty "parameters object" as placeholder until we get data.

  $: selectedModel    = customScenarioGUID ? MODEL_CUSTOM : MODEL_GOH

  $: [firstHistoricalDate, goh_states_fin_before_slicing, P_all_historical_before_slicing] = createHistoricalEstimates(hs_parsed, N, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR, undetected_infections, unrecorded_deaths)
  $: firstBarDate     = firstHistoricalDate

  $: lastHistoricDay       = P_all_historical_before_slicing.length-1
  $: cutoffHistoricDay     = cutoffHistoricDay ? cutoffHistoricDay : lastHistoricDay+1
  $: P_all_historical      = P_all_historical_before_slicing.slice(0, cutoffHistoricDay)
  $: goh_states_fin        = goh_states_fin_before_slicing.slice(0, cutoffHistoricDay)
  $: latestRtEstimateValue = Number.parseFloat(latestRtEstimate[0]["Rt"])
  $: latestRtEstimateDate  = latestRtEstimate[0]["date"]
  $: latestR0EstimateValue = get_R0_from_Rt(latestRtEstimateValue, goh_states_fin)
  $: R0                    = R0 ? R0 : latestR0EstimateValue
  $: setDefaultParamsR0(latestR0EstimateValue, latestRtEstimateDate)
  $: lastHistoricBar       = getlastHistoricBar(P_all_historical, dt)

  $: actionMarkers    = actionMarkerHelper(P_all_historical, custom_params)
  $: stateMeta        = getDefaultStateMeta()

  $: P_all_future     = get_solution(
                          selectedModel,
                          P_all_fetched,
                          actionMarkers,
                          goh_states_fin,
                          dt,
                          N,
                          I0,
                          R0,
                          D_incbation,
                          D_infectious,
                          D_recovery_mild,
                          D_hospital,
                          P_SEVERE,
                          P_ICU,
                          CFR
                        )
  $: P_all            = with_enough_days(P_all_historical.concat(P_all_future), dt)
  $: P_bars           = get_every_nth(take_slice_from_beginning(P_all, dt), dt)
  $: timestep         = dt
  $: tmax             = dt*101
  $: Pmax             = getPmax(P_bars, stateMeta)
  $: lock             = false
  $: debugHelp        = debugHelper([])
  $: flashMessage     = ''
  $: popupHTML        = ''



  var Plock = 1

  var drag_y = function (){
    var dragstarty = 0
    var Pmaxstart = 0

    var dragstarted = function (d) {
      dragstarty = event.y  
      Pmaxstart  = Pmax
    }

    var dragged = function (d) {
      Pmax = Math.max( (Pmaxstart*(1 + (event.y - dragstarty)/500)), 10)
    }

    return drag().on("drag", dragged).on("start", dragstarted)
  }

  var drag_x = function (){
    var dragstartx = 0
    var dtstart = 0
    var Pmaxstart = 0
    var dragstarted = function (d) {
      dragstartx = event.x
      dtstart  = dt
      Plock = Pmax
      lock = true
    }
    var dragged = function (d) {
      dt = dtstart - 0.0015*(event.x - dragstartx)
    }
    var dragend = function (d) {
      lock = false
    }
    return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
  }

  $: parsed = "";
  onMount(async () => {

    if (customScenarioGUID) {
      fetchCustomScenarioAsync()
    }

    var drag_callback_y = drag_y()
    drag_callback_y(selectAll("#yAxisDrag"))

  });

  function lock_yaxis(){
    Plock = Pmax
    lock  = true
  }

  function unlock_yaxis(){
    lock = false
  }

  let width  = 750;
  let height = 400;
  

  $: xScaleTime = scaleLinear()
    .domain([0, tmax])
    .range([padding.left, width - padding.right]);

  $: xScaleTimeInv = scaleLinear()
    .domain([0, width])
    .range([0, tmax]);

  $: indexToTime = scaleLinear()
    .domain([0, P_bars.length])
    .range([0, tmax])

  window.addEventListener('mouseup', unlock_yaxis);

  function activeHelper(active, lastHistoricBar) {
    if (active >= 0) {
      // Case: User hovers over a bar or has locked a bar.
      return active
    }
    return lastHistoricBar
  }

  $: active  = 0
  $: active_ = activeHelper(active, lastHistoricBar)

  var Tinc_s = "\\color{#CCC}{T^{-1}_{\\text{inc}}} "
  var Tinf_s = "\\color{#CCC}{T^{-1}_{\\text{inf}}}"
  var Rt_s   = "\\color{#CCC}{\\frac{\\mathcal{R}_{t}}{T_{\\text{inf}}}} "
  $: ode_eqn = katex.renderToString("\\frac{d S}{d t}=-" +Rt_s +"\\cdot IS,\\qquad \\frac{d E}{d t}=" +Rt_s +"\\cdot IS- " + Tinc_s + " E,\\qquad \\frac{d I}{d t}=" + Tinc_s + "E-" + Tinf_s+ "I, \\qquad \\frac{d R}{d t}=" + Tinf_s+ "I", {
    throwOnError: false,
    displayMode: true,
    colorIsTextColor: true
  });
  
  $: p_num_ind = 40

  function get_icu_peak(P) {

    function argmax(k) {
      var maxVal = 0
      var maxValIndex = 0
      for (var i=0; i<P.length; i+=1) {
        const val = P[i][k]
        if (val > maxVal) {
          maxVal = val
          maxValIndex = i
        }
      }
      return maxValIndex
    }

    const peakICUDay = argmax('icu')
    const peakICUCount = Math.round(P[peakICUDay]['icu'])
    return [peakICUDay, peakICUCount]
  }

  $: [peakICUDay, peakICUCount] = get_icu_peak(P_all)

  function get_milestones(P, firstBarDate, cutoffHistoricDay, dt) {

    var milestones = []
    
    // First death milestone
    for (var i = 0; i < P.length; i+=1) {
      if (P[i]['fatalities'] >= 0.5) {
        milestones.push([i, "First death"])
        break
      }
    }
    
    // Peak ICU milestone
    milestones.push([peakICUDay, "Peak: " + format(",")(peakICUCount) + " ICU"])

    // Historical date offset milestone
    const lastHistoricDate = getDate(firstBarDate, cutoffHistoricDay-1)
    milestones.push([cutoffHistoricDay-1, lastHistoricDate])

    // Filter out milestones which are outside the currently zoomed in area
    milestones = milestones.filter(milestone => {
      return milestone[0] < 100*dt
    })

    return milestones
  }

  $: milestones = get_milestones(P_all, firstBarDate, cutoffHistoricDay, dt)
  $: log = true

</script>

<link rel="stylesheet" href="katex.css">

<style>
  .small { font: italic 6px Source Code Pro; }
  @font-face {
    font-family: 'Source Code Pro';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: local('Source Code Pro Regular'), local('SourceCodePro-Regular'), url(fonts/HI_SiYsKILxRpg3hIP6sJ7fM7PqlPevW.woff2) format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  
  @font-face {
    font-family: 'Liberation Sans';
    font-style: normal;
    font-weight: normal;
    font-display: swap;
    src: url(fonts/LiberationSans-Regular.ttf) format('truetype')
  }

  @font-face {
    font-family: 'Liberation Sans';
    font-style: normal;
    font-weight: bold;
    font-display: swap;
    src: url(fonts/LiberationSans-Bold.ttf) format('truetype')
  }

  @font-face {
    font-family: 'Liberation Sans';
    font-style: italic;
    font-weight: normal;
    font-display: swap;
    src: url(fonts/LiberationSans-Italic.ttf) format('truetype')
  }

  @font-face {
    font-family: 'Liberation Sans';
    font-style: italic;
    font-weight: bold;
    font-display: swap;
    src: url(fonts/LiberationSans-BoldItalic.ttf) format('truetype')
  }

  :global(html) {
      overflow-y: scroll;
      font-family: 'Liberation Sans';
  }

  h2 {
    margin: auto;
    width: 950px;
    font-size: 40px;
    padding-top: 20px;
    padding-bottom: 0px;
    font-weight: 300;
  }

  h5 {
    margin: auto;
    margin-top: 0;
    width: 950px;
    font-size: 16px;
    padding-left: 40px;
    padding-bottom: 20px;
    font-weight: 300;
    font-style: italic;
    padding-bottom: 30px
  }

  .center {
    margin: auto;
    width: 950px;
    padding-bottom: 20px;
    font-weight: 300;
    color:#666;
    font-size: 16.5px;
    text-align: justify;
    line-height: 24px
  }

  .ack {
    margin: auto;
    width: 950px;
    padding-bottom: 20px;
    font-weight: 300;
    color:#333;
    font-size: 13px;
  }

  .row {
    margin: auto;
    display: flex;
    width: 948px;
    font-size: 13px;
  }

  .column {
    flex: 158px;
    padding: 0px 5px 5px 0px;
    margin: 0px 5px 5px 5px;
    /*border-top: 2px solid #999*/
  }

  .minorTitle {
    margin: auto;
    display: flex;
    width: 950px;
    font-size: 17px;
    color: #666;
  }

  .minorTitleColumn{
    flex: 60px;
    padding: 3px;
    border-bottom: 2px solid #999;
  }


  .paneltext{
    position:relative;
  }

  .paneltitle{
    color:#777; 
    line-height: 17px; 
    padding-bottom: 4px;
    font-weight: 700;
  }

  .paneldesc{
    color:#888; 
    text-align: left;
    font-weight: 300;
  }

  .slidertext{
    color:#555; 
    line-height: 7px; 
    padding-bottom: 0px; 
    padding-top: 7px;
    font-family: 'Source Code Pro', monospace;
    font-size: 10px;
    text-align: right;
    /*font-weight: bold*/
  }
    
  .range {
    width: 100%;
  }

  .chart {
    width: 100%;
    margin: 0 auto;
    padding-top:0px;
    padding-bottom:10px;
  }

  /* TODO should be moved to global.css because this is copypasted into 3 components. */
  .legendtext{
    color:#888; 
    font-size:13px;
    padding-bottom: 5px;
    font-weight: 300;
    line-height: 14px;
  }

  .tick {
    font-size: .725em;
    font-weight: 200;
    font-size: 13px
  }

  td { 
    text-align: left;
    border-bottom: 1px solid #DDD;
    border-collapse: collapse;
    padding: 3px;
    /*font-size: 14px;*/
  }

  tr {
    border-collapse: collapse;
    border-spacing: 15px;
  }

  .eqn {
    margin: auto;
    display: flex;
    flex-flow: row wrap;
    width: 950px;
    column-count: 4;
    font-weight: 300;
    color:#666;
    font-size: 16.5px;
  }

  :global(.clickableIcons:hover) {
    cursor: pointer;
    color: #777 !important;
  }

  @media screen and (max-width: 1199px) {
      .mobileWarning {
        margin-top: 0px;
        margin-bottom: 40px;
      }
  }

  @media screen and (min-width: 1200px) {
      .mobileWarning {
        visibility: hidden;
        position: absolute;
      }
  }

  th { font-weight: 500; text-align: left; padding-bottom: 5px; vertical-align: text-top;     border-bottom: 1px solid #DDD; }

  a:link { color: grey; }
  a:visited { color: grey; }

</style>


<h2><div>
  <span style="">Corosim</span>
  <img style="vertical-align:middle" src="flag.png" title="Finland" alt="finnish flag" width="100">
</div></h2>
<h5>Historical Estimates & Model Predictions for COVID-19 in Finland</h5>

<div class="mobileWarning">
  <h3>Sorry! This web app is not optimized for a mobile experience or small screens. If you can, please come back on a desktop device.</h3>
</div>

<div class="chart" style="display: flex; max-width: 1120px">
  <div style="flex: 0 0 270px; width:270px;">
    <div style="height: 50px;">
      
      <!-- Deprecated scenario dropdown selector. -->
      {#if display_scenario_dropdown}
        <div class="legendtext" style="font-size: 14px; line-height:16px; font-weight: bold; color: #777;">
          Select scenario and model:
        </div>
        <select id="model-selection" bind:value={selectedModel}>
          <option value={MODEL_GOH} >Finland | Goh's SEIR ODE (live)</option>
          <option value={MODEL_CUSTOM} disabled={customScenarioGUID ? false : true} >Custom scenario (precomputed)</option>
        </select>
      {/if}

    </div>

    <!-- ChartCompanion (scenario outcome and highlighted day, left side of chart). -->
    <div style="position:relative; top:100px; right:-115px">
      <ChartCompanion bind:stateMeta = {stateMeta}
        N = {N}
        dt = {dt}
        P_all = {P_all}
        P_bars = {P_bars}
        active_ = {active_}
        indexToTime = {indexToTime}
        firstBarDate = {firstBarDate}
        peakICUDay = {peakICUDay}
        peakICUCount = {peakICUCount}
      />

    </div>
  </div>

  <div style="flex: 0 0 890px; width:890px; height: {height+128}px; position:relative;">

    <!-- Flash message to help the user understand why some action was not possible. -->
    <div on:click={() => {flashMessage = ''}} style="position: absolute;
                left: 400px;
                top: -70px;
                width: 700px;
                cursor: pointer;
                color: #f0027f;
                opacity: 0.5;
                visibility: {flashMessage !== '' ? 'visible' : 'hidden'};
                font-size: 16px;
                ">
      <Icon data={exclamationCircle}
        scale=1.5
        style="color: #f0027f; position: absolute; cursor: pointer;"
        />
      <span style="position: absolute; left: 30px; top: 3px;">
        {flashMessage}
      </span>
    </div>

    <div style="position:relative; top:60px; left: 10px" >

      <!-- Big overlay text about "fetching" or "error" when dealing with custom scenarios. -->
      {#if selectedModel === MODEL_CUSTOM && customScenarioStatus !== ''}
        <div style="position: absolute; top: 100px; left: 100px; font-size: 40px;">
          {customScenarioStatus}
        </div>
      {/if}

      <!-- The actual chart with bars and stuff. -->
      <Chart bind:active={active}
        states = {P_bars} 
        stateMeta = {stateMeta}
        xmax = {Xmax}
        timestep={timestep}
        tmax={tmax}
        N={N}
        ymax={lock ? Plock: Pmax}
        selectedModel={selectedModel}
        icuCapacity={icuCapacity}
        log={!log}
        firstBarDate = {firstBarDate}
        />

      <!-- Buttons on thee right side of chart: zoom and add. -->
      <div>
        {#if selectedModel === MODEL_GOH}
        <div on:click={addActionMarker} title="Add new action marker">
          <Icon data={plus}
            scale=2.5
            class="clickableIcons"
            style="color: #CCC; position: absolute; right: 70px; top: 20px;"
            />
        </div>
        {/if}
        <div on:click={toggleZoomStates} title="Zoom">
          <Icon data={search}
            scale=2.5
            class="clickableIcons"
            style="color: #CCC; position: absolute; right: 70px; bottom: 0px;"
            />
        </div>
      </div>
    </div>

    <!-- Y axis zoom. -->
    <div id="yAxisDrag"
          style="cursor:row-resize;
                pointer-events: all;
                position: absolute;
                top:{55}px;
                left:{0}px;
                width:{20}px;
                background-color:#222;
                opacity: 0;
                height:425px;">
    </div>

    <!-- History Marker. -->
    {#if cutoffHistoricDay < tmax}
      <HistoryMarker
        width = {width}
        height = {height}
        R0 = {R0}
        tmax = {tmax}
        Pmax = {Pmax}
        lastHistoricDay = {lastHistoricDay}
        bind:cutoffHistoricDay = {cutoffHistoricDay}
        bind:Plock = {Plock}
        bind:lock = {lock}
        bind:lock_yaxis = {lock_yaxis}
        bind:flashMessage = {flashMessage}
      />
    {/if}

    <!-- Action Markers. -->
    {#each actionMarkers[selectedModel] as actionMarkerData}
      {#if actionMarkerData[AM_DAY] < tmax}
        <ActionMarker
          width = {width}
          height = {height}
          R0 = {R0}
          tmax = {tmax}
          Pmax = {Pmax}
          P_all_historical = {P_all_historical}
          firstBarDate = {firstBarDate}
          bind:allActiveActionMarkers = {actionMarkers[selectedModel]}
          bind:actionMarkerData = {actionMarkerData}
          bind:Plock = {Plock}
          bind:lock = {lock}
          bind:lock_yaxis = {lock_yaxis}
          bind:flashMessage = {flashMessage}
        />
      {/if}
    {/each}

    <!-- Milestones -->
    <div style="pointer-events: none;
                position: absolute;
                top:{height+84}px;
                left:{0}px;
                width:{780}px;
                opacity: 1.0;
                height:25px;
                cursor:col-resize">
          {#each milestones as milestone}
            <div style="position:absolute; left: {xScaleTime(milestone[0])+8}px; top: -30px;">
              <span style="opacity: 0.3"><Arrow height=30 arrowhead="#circle" dasharray = "2 1"/></span>
                <div class="tick" style="position: relative; left: 0px; top: 35px; max-width: 130px; color: #BBB; background-color: white; padding-left: 4px; padding-right: 4px">{@html milestone[1]}</div>
            </div>
          {/each}
    </div>

   </div>

</div>

<p class="center">
  <b>Parameter configuration</b>
</p>

<!-- Large popup when user clicks a question mark icon. -->
{#if popupHTML !== ''}
  <div class="center" style="padding-bottom: 0px;">
    <div style="position: absolute; width: 950px; background-color: white; border: 1px solid #CCC; border-radius: 5px; z-index: 999999;">
      <div on:click={closePopup} title="Close">
        <Icon data={times}
          scale=3
          class="clickableIcons"
          style="color: #CCC; position: absolute; right: 20px; top: 20px;"
          />
      </div>
      <div style="position: relative;
                  top: 20px;
                  padding-bottom: 20px;
                  left: 50px;
                  width: 85%;
                  font-weight: 300;
                  color:#666;
                  font-size: 16.5px;
                  text-align: justify;
                  line-height: 24px">
        {@html popupHTML}
        <button on:click={closePopup} style="color: #666; font-size: 20px; cursor: pointer; padding: 10px; background: none; border: 1px solid #CCC;"><b>OK</b></button>
        <br><br>
      </div>
    </div>
  </div>
{/if}

<!-- Parameter Knobs -->
<div style="padding-bottom: 10px;">
  
  <div class="row">

    {#if selectedModel === MODEL_GOH}

      <div class="column" style="margin-left: 0;">
        <ParameterKnob p = {paramConfigR0} bind:value = {R0} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["undetected_infections"]} bind:value = {undetected_infections} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["unrecorded_deaths"]} bind:value = {unrecorded_deaths} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["days_from_incubation_to_infectious"]} bind:value = {D_incbation} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["days_from_infectious_to_not_infectious"]} bind:value = {D_infectious} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["days_in_hospital"]} bind:value = {D_hospital} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["days_in_mild_recovering_state"]} bind:value = {D_recovery_mild} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["hospitalization_rate"]} bind:value = {P_SEVERE} specialCaseAddToDisplayValue = {CFR} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["fatality_rate"]} bind:value = {CFR} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["icu_rate_from_hospitalized"]} bind:value = {P_ICU} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["icu_capacity"]} bind:value = {icuCapacity} bind:popupHTML = {popupHTML} />
      </div>

    {/if}

    {#if selectedModel !== MODEL_GOH}
      <div>
        <p style="white-space: pre-wrap; color: #777; line-height: 17px;">{@html JSON.stringify(custom_params, null, 4)}</p>
      </div>
    {/if}

  </div>
</div>

{#if selectedModel === MODEL_GOH}

  <Collapsible title="Introduction" bind:collapsed={collapsed} defaultCollapsed={false}>
    <div>
      Corosim combines historical estimates & model predictions to provide a complete overview of the Coronavirus epidemic in Finland.
      This means you can use Corosim to get some insight towards questions such as "how many Finns have been infected so far" or "when will the epidemic peak".
    </div>
    <div>
      Historical estimates are updated daily based on data provided by <a href="https://github.com/HS-Datadesk/koronavirus-avoindata">Helsingin Sanomat</a>.
      For example, the estimate for the number of infected is based on the number of confirmed cases in data, but is also affected by various parameters,
      such as the percentage of undetected infections, length of the incubation period, how long individuals remain infectious, and so forth.
      We would like to emphasize that while the model is a legitimate infectious disease model, our historical estimates are simple
      "back of the napkin" type calculations. We refer
      to <a href="https://github.com/futurice/corona-simulations/blob/master/src/models/historical_estimates.js#L4">the source code</a> for
      details on historical estimates.
    </div>
    <div>
      The model is initialized with the latest historical estimates for the number of individuals incubating, recovering, etc. Parameter choices impact
      both historical estimates and model predictions. Although we have done a lot of research to provide sensible default values,
      you probably disagree with some of our choices. That's why we wanted to provide you the possibility of tuning parameters by yourself.
      You can also set your own action markers to model the effects of different policy changes (those vertical things on top of the chart).
    </div>
    <div>
      At this time <i>no other</i> website provides a service like this. For example, other Coronavirus modelling websites
      typically begin the simulation from a theoretical "day zero" which can not be configured according to estimates of the current situation
      (typically you can only adjust the number of infected). We are in the middle of the epidemic &#8212; long past day zero.
      Doesn't it make sense to start the simulation from the most recent estimate of the current situation? That's what Corosim does.
    </div>
    <div>
      We have <a href="https://github.com/futurice/corona-simulations">open sourced Corosim on GitHub</a> under the MIT license.
      The README has instructions on
      <a href="https://github.com/futurice/corona-simulations#want-to-fork-this-repo-and-customize-it-for-your-country">how to</a>
      customize Corosim for different countries or local areas.
    </div>
  </Collapsible>

  <Collapsible title="R0 estimation" bind:collapsed={collapsed} defaultCollapsed={true}>
    <div>
      {@html stylizeExpressions(paramConfigR0['longformDefaultValueJustification'])}
    </div>
  </Collapsible>

  <Collapsible title="More on model predictions" bind:collapsed={collapsed} defaultCollapsed={true}>
    <div>
    
      Corosim uses Gabriel Goh's implementation of a
      <b><a href="https://en.wikipedia.org/wiki/Compartmental_models_in_epidemiology#The_SEIR_model">SEIR</a></b> model    
      (<b>S</b>usceptible → <b>E</b>xposed → <b>I</b>nfected → <b>R</b>emoved).
      This is a classical infectious disease model, commonly used to this day in the front lines of research.
      For example, the Finnish health authority THL
      <a href="https://thl.fi/fi/-/koronaepidemian-mallinnus-ihmiskontaktien-rajoittaminen-vaikuttaa-epidemian-kestoon-ja-paivittaisten-tartuntojen-maaraan">
        uses a similar SEIR model for their official Coronavirus forecasts.</a> One key difference between Corosim and THL's model is that
        THL's model is initialized to a theoretical "day zero", whereas Corosim is initialized to the latest historical estimate.
        Another key difference is that THL's model is divided into age groups, Corosim's model is not.
        These are certainly not the only differences between these models &#8212; unfortunately THL has not published their entire model,
        so we are unable to provide a thorough comparison. Most of the discussion around models in Finland seems to revolve around parameter
        choices, rather than models themselves.
      
    </div>
    <div>
      The dynamics of this model are characterized by a set of four ordinary differential equations that correspond to the stages of the disease's progression:
      <span style="color:#777">{@html ode_eqn}</span>
      The clinical dynamics in this model are an elaboration on SEIR that simulates the disease's progression at a higher resolution,
      subdividing {@html math_inline("R")} into <i>mild</i> (patients who recover without the need for hospitalization), <i>moderate</i>
      (patients who require hospitalization but survive) and <i>fatal</i> (patients who require hospitalization and do not survive).
      Each of these variables follows its own trajectory to the final outcome, and the sum of these compartments add up to the {@html math_inline("R")} in SEIR.
      <br><br>
      Note that the model is a simplification of reality in many ways:
    </div>
    <ul>
      <li>All hospitalizations are assumed to occur immediately after the infectious period.</li>
      <li>Individuals who are recovering in home or hospital are assumed to be completely isolated.</li>
      <li>Hospitalization duration is assumed to be the same for regular ward, icu, and fatalities.</li>
      <li>Icu capacity is just a visual indicator, exceeding capacity has no effect on fatalities.</li>
      <li>All fatalities are assumed to come from hospitals. In reality, many fatalities come from nursing homes,
          which means that this model overestimates hospitalization and ICU counts. Note that the model does <i>not</i>
          necessarily underestimate fatalities; the fatality rate can be adjusted to take into account all deaths,
          regardless of where they occur.</li>
    </ul>
  </Collapsible>

  <Collapsible title="Why the latest historical estimate is several days old" bind:collapsed={collapsed} defaultCollapsed={true}>
    <div>
      You may have noticed that the latest historical estimate is several days old, and you may be wondering if historical estimates are updated.
      Yes, historical estimates are updated every 3 hours. You can expect to see changes at least once per day, depending
      on how often THL updates their data. Unfortunately we do not have reliable numbers for the <i>most recent</i> days, so we have chosen
      to display model predictions for those days instead of displaying historical estimates.
    </div>
    <div>
      Why don't we have reliable numbers for the most recent days? This is caused by two separate issues.
      As an example, let's consider the number of active infections.
      The estimate for active infections is based on confirmed cases (and assumptions and parameters). If we have 10 confirmed cases today,
      we can assume that those cases were infected several days ago. So if we wanted to estimate the number of active infections today,
      we would need data from <i>several days in the future</i>. We don't have data from the future, so we can't use this method to estimate
      the number active infections today (though of course we can use other methods, such as model predictions, to estimate the number
      of active infections today). In addition to this, another contributing factor is reporting delay to the confirmed case numbers themselves:
      If you look at the number of confirmed cases reported for yesterday, write it down, and come back one week later to check that the number
      hasn't changed, it probably has. For some reason, confirmed cases and deaths are often reported with a few days of delay.
    </div>
  </Collapsible>

  <Collapsible title="Differences between Corosim and Epidemic Calculator" bind:collapsed={collapsed} defaultCollapsed={true}>
    <div style="padding-bottom: 16.5px;">
      {@html oneLineAttribution}
    </div>
    <div>
      Key differences between Corosim and Epidemic Calculator:
    </div>
    <ul>
      <li>Historical estimates. The original Epidemic Calculator initiates the simulation from a theoretical "day zero".
          Corosim initiates the simulation from the latest historical estimate. Estimates are updated daily.</li>
      <li>Corosim is tailored to the current situation in Finland. In addition to Finnish historical data, all the parameter default values have been chosen
          based on latest scientific research, and specific to Finland when applicable. For example, the most crucial parameter in
          this model is {@html math_inline('\\mathcal{R}_0')}. It's constantly changing and it's specific to the population which
          you are trying to model (meaning, the {@html math_inline('\\mathcal{R}_0')} for Italy will be different than the
          {@html math_inline('\\mathcal{R}_0')} for Finland). For these reasons a hardcoded default value for {@html math_inline('\\mathcal{R}_0')}
          would become stale in a matter of days. Instead of using a hardcoded value, the default value for {@html math_inline('\\mathcal{R}_0')}
          in Corosim is updated automatically every day based on the most recent Finnish data.</li>
      <li>User-facing states are different (e.g. infected vs. infectious). The old Epidemic Calculator is a great educational tool about
          the progression of epidemics in general, but our focus was on practical real-world questions related to this epidemic right now.
          The states we have chosen to visualize are relevant for practical questions, such as "how many people are infected" or
          "do we have enough health care capacity".</li>
      <li>Multiple action markers. The old Epidemic Calculator only has a single action marker, labeled "intervention" and it can
          only reduce the transmission of the virus, not increase it. What if you wanted to model the effect of <i>stopping</i> an intervention? How about
          modelling multiple policy changes? You can do those things with Corosim.</li>
      <li>Scenario outcome summary. The old Epidemic Calculator does not have an easy way summarize an outcome. If you want to compare
          two different strategies, you need to manually zoom out and eyeball the peak, fatalities, etc. Corosim provides a scenario outcome summary
          of the most crucial metrics.</li>
      <li>Small changes to the model itself: hospitalizations go to hospital without delay and fatalities are affected by the
          same hospitalization time as recovering patients. These simplifications were motivated by a desire to make the parameterization
          easier to communicate to the end user. For example, in the original Epidemic Calculator there is a parameter labelled
          "Length of hospital stay", but it actually affects only those patients who eventually survive, not those who eventually die.
          We noticed similar issues with parameters "Time to hospitalization" and "Case fatality rate". In the original Epidemic Calculator,
          case fatality rate actually affects the hospitalization rate, but this effect is hidden from the end user.</li>
      <li>Various design and UX improvements (real dates, more tooltips, reduced clutter, etc.) </li>
    </ul>
  </Collapsible>

  <Collapsible title="Attribution" bind:collapsed={collapsed} defaultCollapsed={false}> 
    <div>
      {@html replaceFuturiceFromTextWithLogo(oneLineAttribution)}
    </div>
    <div>
      For any enquiries, contact Atte Juvonen at futurice.com.
    </div>
    <div>
      <a href="https://github.com/futurice/corona-simulations">Source code available on GitHub.</a>
    </div>
  </Collapsible>

{/if}