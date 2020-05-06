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
  import { search, plus, exclamationCircle, times } from 'svelte-awesome/icons';
  import katex from 'katex';

  // Custom Svelte components
  import Chart from './components/Chart.svelte';
  import ChartCompanion from './components/ChartCompanion.svelte';
  import Checkbox from './components/Checkbox.svelte';
  import Arrow from './components/Arrow.svelte';
  import HistoryMarker from './components/HistoryMarker.svelte';
  import ActionMarker from './components/ActionMarker.svelte';
  import ParameterKnob from './components/ParameterKnob.svelte';

  // Custom utilities
  import { ActionMarkerData, AM_DAY } from './action_marker_data.js';
  import defaultParameters from '../default_parameters.js';
  import { UFState, getDefaultStateMeta } from './user_facing_states.js';
  import { get_solution_from_gohs_seir_ode, map_goh_states_into_UFStates, goh_default_action_markers } from './models/gohs_seir_ode.js';
  import { map_berkeley_states_into_UFStates, temphack, get_berkeley_action_markers } from './models/berkeley_abm.js';
  import { loadFinnishHistoricalEstimates } from './models/historical_estimates.js';
  import { addDays,
           formatCount, formatDelta,
           SHOW_HISTORICAL, SHOW_FUTURE, SHOW_HISTORICAL_AND_FUTURE,
           MODEL_GOH, MODEL_BERKELEY, MODEL_REINA, MODEL_CUSTOM,
         } from './utils.js';
  import { math_inline, math_display, padding } from './utils.js';

  // Static data imports
  import finnishCoronaData from './../data/finnishCoronaData.json';
  import berkeley_states from './../data/berkeley6_states.json';
  import berkeley_params from './../data/berkeley6_params.json'; 
  import finnishHistoricalEstimates from './../data/hardcodedHistoricalEstimates.csv';
  import latestRtEstimate from './../data/latest_Rt.csv';




  function range(n){
    return Array(n).fill().map((_, i) => i);
  }

  function get_R0_from_Rt(Rt, goh_states_fin) {
    const prop_susceptible = goh_states_fin[goh_states_fin.length-1][0]
    return Rt / prop_susceptible
  }

  // This is needed because when we zoom out, Chart needs every nth datapoint from P.
  function get_every_nth(P, n) {
    var arr = []
    for (var i=0; i<P.length; i+=n) {
      arr.push(P[i])
    }
    return arr
  }

  let allow_x_axis_resizing = false // x axis "drag resizing" was replaced by magnifying glass toggle
  let display_scenario_dropdown = false
  let display_toggle_for_historical_estimates = false

  let custom_scenario_url_prefix = 'https://coronastoragemyvs.blob.core.windows.net/coviducb/'
  //let custom_scenario_url_prefix = 'http://localhost:5000/'
  let custom_scenario_url_postfix = '-outcome_1.json'

  $: Time_to_death     = defaultParameters["days_from_incubation_to_death"]
  $: N                 = defaultParameters["initial_population_count"]
  $: logN              = Math.log(N)
  $: I0                = 1
  $: D_incbation       = defaultParameters["days_from_incubation_to_infectious"]  
  $: D_infectious      = defaultParameters["days_from_infectious_to_not_infectious"]
  $: D_recovery_mild   = defaultParameters["days_in_mild_recovering_state"]
  $: D_recovery_severe = defaultParameters["days_in_hospital"]
  $: D_hospital_lag    = defaultParameters["days_in_severe_recovering_state_before_hospital"]
  $: D_death           = Time_to_death - D_infectious 
  $: CFR               = defaultParameters["fatality_rate"]
  $: Time              = 220
  $: Xmax              = 110000
  $: dt                = 2
  $: P_SEVERE          = defaultParameters["hospitalization_rate"]
  $: P_ICU             = defaultParameters["icu_rate_from_hospitalized"]
  $: icuCapacity       = defaultParameters["icu_capacity"]



  // "share your model" ?
  /*
  $: state = location.protocol + '//' + location.host + location.pathname + "?" + queryString.stringify({"Time_to_death":Time_to_death,
               "logN":logN,
               "I0":I0,
               "R0":R0,
               "D_incbation":D_incbation,
               "D_infectious":D_infectious,
               "D_recovery_mild":D_recovery_mild,
               "D_recovery_severe":D_recovery_severe,
               "CFR":CFR,
               "D_hospital_lag":D_hospital_lag,
               "P_SEVERE": P_SEVERE})
               */

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

  function getlastHistoricBar(demo_mode, P_all_historical, dt) {
    if (!P_all_historical || demo_mode === SHOW_FUTURE) return 0
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

  function chooseP(demo_mode, P_all_historical, P_all_future) {
    var P_chosen = []
    if (demo_mode === SHOW_HISTORICAL) P_chosen = P_all_historical
    if (demo_mode === SHOW_FUTURE) P_chosen = P_all_future
    if (demo_mode === SHOW_HISTORICAL_AND_FUTURE) P_chosen = P_all_historical.concat(P_all_future)
    return P_chosen
  }

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
    P_all_fetched = temphack(json["scenario_states"], json["scenario_params"], N)
    custom_params = {...json["scenario_params"], ...json["parameters"]}
    actionMarkers = actionMarkerHelper(P_all_historical, custom_params)
  }

  function get_solution(demo_mode, selectedModel, P_all_fetched, actionMarkers, goh_states_fin, berkeley_states, berkeley_params, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital_lag, D_recovery_severe, D_death, P_SEVERE, P_ICU, CFR) {
    if (selectedModel === MODEL_GOH) {
      return get_solution_from_gohs_seir_ode(demo_mode, actionMarkers[selectedModel], goh_states_fin, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital_lag, D_recovery_severe, D_death, P_SEVERE, P_ICU, CFR)
    } else if (selectedModel === MODEL_BERKELEY) {
      return temphack(berkeley_states, berkeley_params, N)
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
      m[MODEL_GOH] = goh_default_action_markers()
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
    m[MODEL_BERKELEY] = get_berkeley_action_markers(P_all_historical.length, berkeley_params)
    m[MODEL_REINA] = []
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
  $: selectedParams   = selectedModel === MODEL_BERKELEY ? berkeley_params : custom_params
  $: showHistory      = true
  $: demo_mode        = showHistory ? SHOW_HISTORICAL_AND_FUTURE : SHOW_FUTURE

  $: [firstHistoricalDate, goh_states_fin_before_slicing] = loadFinnishHistoricalEstimates(finnishHistoricalEstimates, N)
  $: firstBarDate     = showHistory ? firstHistoricalDate : addDays(firstHistoricalDate, goh_states_fin_before_slicing.length - 1)

  $: P_all_historical_before_slicing = map_goh_states_into_UFStates(goh_states_fin_before_slicing, N, P_ICU)
  $: lastHistoricDay       = P_all_historical_before_slicing.length-1
  $: cutoffHistoricDay     = cutoffHistoricDay ? cutoffHistoricDay : lastHistoricDay+1
  $: P_all_historical      = P_all_historical_before_slicing.slice(0, cutoffHistoricDay)
  $: goh_states_fin        = goh_states_fin_before_slicing.slice(0, cutoffHistoricDay)
  $: latestRtEstimateValue = Number.parseFloat(latestRtEstimate[0]["Rt"])
  $: latestRtEstimateDate  = latestRtEstimate[0]["date"]
  $: latestR0EstimateValue = get_R0_from_Rt(latestRtEstimateValue, goh_states_fin)
  $: R0                    = latestR0EstimateValue
  $: lastHistoricBar       = getlastHistoricBar(demo_mode, P_all_historical, dt)

  $: actionMarkers    = actionMarkerHelper(P_all_historical, custom_params)
  $: stateMeta        = getDefaultStateMeta()

  $: P_all_future     = get_solution(
                          demo_mode,
                          selectedModel,
                          P_all_fetched,
                          actionMarkers,
                          goh_states_fin,
                          berkeley_states,
                          berkeley_params,
                          dt,
                          N,
                          I0,
                          R0,
                          D_incbation,
                          D_infectious,
                          D_recovery_mild,
                          D_hospital_lag,
                          D_recovery_severe,
                          D_death, P_SEVERE,
                          P_ICU,
                          CFR
                        )
  $: P_all            = with_enough_days(chooseP(demo_mode, P_all_historical, P_all_future, dt), dt)
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

    if (allow_x_axis_resizing) {
      var drag_callback_x = drag_x()
      drag_callback_x(selectAll("#xAxisDrag"))
    }

    // TODO what is this? Is it for "share your model" links?
    if (typeof window !== 'undefined') {
      parsed = queryString.parse(window.location.search)
      if (!(parsed.logN === undefined)) {logN = parsed.logN}
      if (!(parsed.I0 === undefined)) {I0 = parseFloat(parsed.I0)}
      if (!(parsed.R0 === undefined)) {R0 = parseFloat(parsed.R0)}
      if (!(parsed.D_incbation === undefined)) {D_incbation = parseFloat(parsed.D_incbation)}
      if (!(parsed.D_infectious === undefined)) {D_infectious = parseFloat(parsed.D_infectious)}
      if (!(parsed.D_recovery_mild === undefined)) {D_recovery_mild = parseFloat(parsed.D_recovery_mild)}
      if (!(parsed.D_recovery_severe === undefined)) {D_recovery_severe = parseFloat(parsed.D_recovery_severe)}
      if (!(parsed.CFR === undefined)) {CFR = parseFloat(parsed.CFR)}
      if (!(parsed.D_hospital_lag === undefined)) {D_hospital_lag = parseFloat(parsed.D_hospital_lag)}
      if (!(parsed.P_SEVERE === undefined)) {P_SEVERE = parseFloat(parsed.P_SEVERE)}
      if (!(parsed.Time_to_death === undefined)) {Time_to_death = parseFloat(parsed.Time_to_death)}

    }

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

  function activeHelper(active, demo_mode, P_all_historical, dt, lastHistoricBar) {
    if (active >= 0) {
      // Case: User hovers over a bar or has locked a bar.
      return active
    }
    if (demo_mode === SHOW_FUTURE) {
      // Case: Historical data is not shown, default to showing first predicted bar.
      return 0
    }
    return lastHistoricBar
  }

  $: active  = 0
  $: active_ = activeHelper(active, demo_mode, P_all_historical, dt, lastHistoricBar)

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

  // Reminder: milestone for peak ICU is different than actual peak ICU, because
  // milestones are chosen from timestepped days, whereas "scenario outcome icu peak" is from all days.
  // So don't merge these by refactoring.
  function get_milestones(P) {

    function argmax(k) {
      var maxVal = 0
      var maxValIndex = 0
      for (var i=0; i<P.length; i+=dt) {
        const val = P[i][k]
        if (val > maxVal) {
          maxVal = val
          maxValIndex = i
        }
      }
      return maxValIndex
    }

    var milestones = []
    for (var i = 0; i < P.length; i+=dt) {
      if (P[i]['fatalities'] >= 0.5) {
        if (i == 0) {
          // If first death occurs on first day, the initial conditions for the visualization
          // are in the middle of the epidemic. In that case we don't want to draw this milestone.
          break
        }
        milestones.push([i, "First death"])
        break
      }
    }
    
    const bar_peak_hosp = argmax('icu')
    if (bar_peak_hosp < 100*dt) {
      // If peak hospitalization occurs on last day of zoomed in area, there is likely a higher peak beyond the visible area.
      // In that case we don't want to draw this milestone.
      milestones.push([bar_peak_hosp, "Peak: " + format(",")(Math.round(P[bar_peak_hosp]['icu'])) + " ICU"])
    }
    return milestones
  }

  $: milestones = get_milestones(P_all)
  $: log = true

</script>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.11.1/dist/katex.css" integrity="sha384-bsHo4/LA+lkZv61JspMDQB9QP1TtO4IgOf2yYS+J6VdAYLVyx1c3XKcsHh0Vy8Ws" crossorigin="anonymous">

<style>
  .small { font: italic 6px Source Code Pro; }
  @import url('https://fonts.googleapis.com/css?family=Source+Code+Pro&display=swap');

  :global(html) {
      overflow-y: scroll;

      /* Any browser which supports CSS3
      filter: blur(10px);
      filter: url("blur.svg#gaussian_blur");
      -webkit-filter: blur(10px); */
  }

  h2 {
    margin: auto;
    width: 950px;
    font-size: 40px;
    padding-top: 20px;
    padding-bottom: 0px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
  }

  h5 {
    margin: auto;
    margin-top: 0;
    width: 950px;
    font-size: 16px;
    padding-left: 40px;
    padding-bottom: 20px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    font-style: italic;
    padding-bottom: 30px
  }

  .center {
    margin: auto;
    width: 950px;
    padding-bottom: 20px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
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
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    color:#333;
    font-size: 13px;
  }

  .row {
    font-family: nyt-franklin,helvetica,arial,sans-serif;
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
    font-family: nyt-franklin,helvetica,arial,sans-serif;
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
    font-family: nyt-franklin,helvetica,arial,sans-serif;
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
    font-family: nyt-franklin,helvetica,arial,sans-serif;
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
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    line-height: 14px;
  }

  .tick {
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    font-size: .725em;
    font-weight: 200;
    font-size: 13px
  }

  td { 
    text-align: left;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
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
    font-family: nyt-franklin,helvetica,arial,sans-serif;
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

  th { font-weight: 500; text-align: left; padding-bottom: 5px; vertical-align: text-top;     border-bottom: 1px solid #DDD; }

  a:link { color: grey; }
  a:visited { color: grey; }

</style>


<h2><div>
  <span style="">Corosim</span>
  <img style="vertical-align:middle" src="flag.png" title="Finland" alt="finnish flag" width="100">
</div></h2>
<h5>Historical Estimates & Model Predictions for COVID-19 in Finland</h5>

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
          <option value={MODEL_BERKELEY} >Finland | Berkeley ABM (precomputed)</option>
          <option value={MODEL_REINA} disabled >Uusimaa | REINA ABM (precomputed)</option>
          <option value={MODEL_CUSTOM} disabled={customScenarioGUID ? false : true} >Custom scenario (precomputed)</option>
        </select>
      {/if}

      <!-- Deprecated toggle for hiding historical estimates. -->
      {#if display_toggle_for_historical_estimates}
        <div style="position: font-family: nyt-franklin,helvetica,arial,sans-serif; font-size: 13px; margin-bottom: 10px; margin-top: 10px; margin-left: 2px;">
          <div class="tick" style="position: relative; color: #AAA; pointer-events:all;">
            <Checkbox color="#BBB" bind:checked={showHistory}/><div style="position: relative; top: 4px; left:20px; color: #777;">Display historical estimates</div>
          </div>
        </div>
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
                font-family: nyt-franklin,helvetica,arial,sans-serif;
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

      <!-- Large popup when user clicks "learn more". -->
      {#if popupHTML !== ''}
        <div style="position: absolute; top: -55px; left: 0px; width: {width-10}px; height: {height+65}px; background-color: white; border: 1px solid #CCC; border-radius: 5px; z-index: 999999;">
          <div on:click={closePopup} title="Close">
            <Icon data={times}
              scale=3
              class="clickableIcons"
              style="color: #CCC; position: absolute; right: 20px; top: 20px;"
              />
          </div>
          <div style="position: absolute; top: 50px; left: 50px; font-weight: 300; font-family: nyt-franklin,helvetica,arial,sans-serif; color:#666; font-size: 16.5px; text-align: justify; line-height: 24px">
            {@html popupHTML}
          </div>
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

    <!-- Deprecated x axis zoom. -->
    {#if allow_x_axis_resizing}
      <div id="xAxisDrag"
          style="{allow_x_axis_resizing ? "cursor:col-resize;" : ""}
                pointer-events: all;
                position: absolute;
                top:{height+80}px;
                left:{0}px;
                width:{780}px;
                background-color:#222;
                opacity: 0;
                height:25px;">
      </div>
    {/if}

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
    {#if demo_mode !== SHOW_FUTURE}
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
          demo_mode = {demo_mode}
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


<div style="height:220px;">
  <div class="minorTitle">
    <div style="margin: 0px 0px 5px 4px" class="minorTitleColumn">Parameter configuration</div>
  </div>
  <div class = "row">

    {#if selectedModel === MODEL_GOH}

      <div class="column">
        <ParameterKnob
          description = "Basic Reproduction Number {math_inline('\\mathcal{R}_0')}"
          bind:value = {R0}
          bind:popupHTML = {popupHTML}
          defaultValue = {latestR0EstimateValue}
          minValue = 0.01
          maxValue = 5
          stepValue = 0.01
          isDefaultValueAutomaticallyGeneratedFromData = true
          />
      </div> 

      <div class="column">

        <ParameterKnob
          description = 'Length of incubation period {math_inline("T_{\\text{inc}}")}'
          bind:value = {D_incbation}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["days_from_incubation_to_infectious"]}
          minValue = 0.15
          maxValue = 24
          stepValue = 0.0001
          unitsDescriptor = 'days'
        />

        <!-- TODO explain why tuning this up causes the epidemic to spread slower. -->
        <ParameterKnob
          description = 'Duration patient is infectious {math_inline("T_{\\text{inf}}")}'
          bind:value = {D_infectious}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["days_from_infectious_to_not_infectious"]}
          minValue = 0
          maxValue = 24
          stepValue = 0.01
          unitsDescriptor = 'days'
        />

      </div>

      <div class="column">

        <ParameterKnob
          description = 'Infected fatality rate'
          bind:value = {CFR}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["fatality_rate"]}
          minValue = 0
          maxValue = 0.05
          stepValue = 0.0001
          isPercentage = true
          unitsDescriptor = '%'
        />

        <ParameterKnob
          description = 'Time from end of incubation to death'
          bind:value = {Time_to_death}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["days_from_incubation_to_death"]}
          minValue = {D_infectious + 0.1}
          maxValue = 100
          stepValue = 0.01
          unitsDescriptor = 'days'
        />

      </div>

      <div class="column">

        <ParameterKnob
          description = 'Length of hospital stay'
          bind:value = {D_recovery_severe}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["days_in_hospital"]}
          minValue = 0.1
          maxValue = 100
          stepValue = 0.01
          unitsDescriptor = 'days'
        />

        <ParameterKnob
          description = 'Recovery time for mild cases'
          bind:value = {D_recovery_mild}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["days_in_mild_recovering_state"]}
          minValue = 0.5
          maxValue = 100
          stepValue = 0.01
          unitsDescriptor = 'days'
        />

      </div>

      <div class="column">

        <ParameterKnob
          description = 'Hospitalization rate'
          bind:value = {P_SEVERE}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["hospitalization_rate"]}
          minValue = 0
          maxValue = 0.2
          stepValue = 0.0001
          isPercentage = true
          unitsDescriptor = '%'
        />

        <ParameterKnob
          description = 'Time to hospitalization'
          bind:value = {D_hospital_lag}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["days_in_severe_recovering_state_before_hospital"]}
          minValue = 0.5
          maxValue = 100
          stepValue = 0.01
          unitsDescriptor = 'days'
        />
  
      </div>

      <div class="column">

        <ParameterKnob
          description = 'ICU rate'
          bind:value = {P_ICU}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["icu_rate_from_hospitalized"]}
          minValue = 0
          maxValue = 1
          stepValue = 0.01
          isPercentage = true
          unitsDescriptor = '%'
        />

        <ParameterKnob
          description = 'ICU capacity'
          bind:value = {icuCapacity}
          bind:popupHTML = {popupHTML}
          defaultValue = {defaultParameters["icu_capacity"]}
          minValue = 0
          maxValue = 10000
          stepValue = 10
          isInteger = true
        />

      </div>

    {/if}

    {#if selectedModel !== MODEL_GOH}
      <div>
        <p style="white-space: pre-wrap; color: #777; line-height: 17px;">{@html JSON.stringify(selectedParams, null, 4)}</p>
      </div>
    {/if}

  </div>
</div>

<div style="position: relative; height: 12px"></div>


{#if selectedModel === MODEL_GOH}
  <p class="center">
    <b>Introduction</b>
  </p>
  <p class="center">
    Corosim combines historical estimates & model predictions to provide a complete overview of the Coronavirus epidemic in Finland.
    This means you can use Corosim to get some insight towards questions such as "how many Finns have been infected so far" or "when will the epidemic peak".
    Historical estimates are updated daily based on data provided by <a href="https://github.com/HS-Datadesk/koronavirus-avoindata">Helsingin Sanomat</a>.
    However, we don't obsess over confirmed cases. We attempt to provide an accurate picture of the epidemic, acknowledging the fact that
    many infections (and even many deaths) are excluded from the official statistics.
  </p>
  <p class="center">
    As you know, a model is only as good as its input parameters. Although we have done a lot of research to provide sensible default values,
    you probably disagree with some of our choices. That's why we wanted to provide you the possibility of tuning parameters by yourself.
    You can also set your own action points to model the effects of different policy changes.
  </p>
  <p class="center">
    At this time <i>no other</i> website provides a service like this. For example, other Coronavirus modelling websites
    typically begin the simulation from a theoretical "day zero" which can not be configured according to estimates of the current situation
    (typically you can only adjust the number of infected). We we are in the middle of the epidemic &#8212; long past day zero.
    Doesn't it make sense to start the simulation from the most recent estimate of the current situation? That's what Corosim does.
  </p>

  <p class="center">
    <b>Model Details</b>
  </p>
  <p class="center">
    Corosim uses Gabriel Goh's implementation of a
    <b><a href="https://en.wikipedia.org/wiki/Compartmental_models_in_epidemiology#The_SEIR_model">SEIR</a></b> model    
    (<b>S</b>usceptible → <b>E</b>xposed → <b>I</b>nfected → <b>R</b>emoved).
    This is a classical infectious disease model, commonly used to this day in the front lines of research.
    For example, the Finnish health authority THL
    <a href="https://thl.fi/fi/-/koronaepidemian-mallinnus-ihmiskontaktien-rajoittaminen-vaikuttaa-epidemian-kestoon-ja-paivittaisten-tartuntojen-maaraan">
      uses a similar SEIR model for their official Coronavirus forecasts.</a> One key difference between Corosim and THL's model is that
      THL's model is initialized to a theoretical "day zero", whereas Corosim is initialized to the latest historical estimate.
      This is certainly not the only difference between these models &#8212; unfortunately THL has not published their model,
      so we can only speculate what those differences might be.
    
  </p>
  <p class="center" style="padding-bottom: 16.5px;">
    The dynamics of this model are characterized by a set of four ordinary differential equations that correspond to the stages of the disease's progression:
    <span style="color:#777">{@html ode_eqn}</span>
    The clinical dynamics in this model are an elaboration on SEIR that simulates the disease's progression at a higher resolution,
    subdividing {@html math_inline("I,R")} into <i>mild</i> (patients who recover without the need for hospitalization), <i>moderate</i>
    (patients who require hospitalization but survive) and <i>fatal</i> (patients who require hospitalization and do not survive).
    Each of these variables follows its own trajectory to the final outcome, and the sum of these compartments add up to the values
    predicted by SEIR.
    <br><br>
    Note that we make the following assumptions for simplicity:
  </p>
  <ul class="center" style="width: 800px;">
    <li>all fatalities are assumed to come from hospitals</li>
    <li>all fatal cases are assumed to be admitted to hospitals immediately after the infectious period</li>
    <li>icu duration is assumed to be the same as hospitalization duration</li>
    <li>exceeding icu capacity is assumed to not affect the fatality rate</li>
  </ul>
  <p class="center" style="padding-bottom: 16.5px;">
    In light of these simplifying assumptions and other factors, we note the following:
  </p>
  <ul class="center" style="width: 800px;">
    <li>ICU bed predictions of this model are probably <i>too low</i></li>
    <li>Fatality predictions of this model are probably <i>too low if icu capacity is exceeded</i></li>
  </ul>

  <p class="center">
    <b>Attribution</b>
  </p>
  <p class="center" style="padding-bottom: 16.5px;">
    Corosim was created by <a href="https://futurice.com/" style="color: #009f77;">Futurice</a> on top of <a href="https://gabgoh.github.io/">Gabriel Goh's</a>
    <a href="https://gabgoh.github.io/COVID/index.html">Epidemic Calculator</a>.
  </p>
  <p class="center">
    For any enquiries, contact Atte Juvonen at futurice.com.
  </p>
  <p class="center">
    Differences between Corosim and Epidemic Calculator:
  </p>
  <ul class="center" style="width: 800px;">
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
    <li>Various design and UX improvements (real dates, more tooltips, reduced clutter, etc.) </li>
    <li>Scenario outcome summary. The old Epidemic Calculator does not have an easy way summarize an outcome. If you want to compare
        two different strategies, you need to manually zoom out and eyeball the peak, fatalities, etc. Corosim provides a scenario outcome summary
        of the most crucial metrics.</li>
  </ul>
  <p class="center">
    <a href="https://github.com/futurice/corona-simulations">Source code available on GitHub.</a>
  </p>

  <!-- Input data -->
  <!-- <div style="margin-bottom: 30px">

    <div class="center" style="padding: 10px; margin-top: 3px; width: 925px">
      <div class="legendtext">Export parameters:</div>
      <form>
        <textarea type="textarea" rows="1" cols="5000" style="white-space: nowrap;  overflow: auto; width:100%; text-align: left" id="fname" name="fname">{state}</textarea>
      </form>
    </div>
  </div>
  -->

{/if}