<script>
  import { scaleLinear, scaleLog } from 'd3-scale';
  import { drag } from 'd3-drag';
  import { selectAll } from 'd3-selection'
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { formatNumber } from '../utils.js';

  const dispatch = createEventDispatcher();

  function range(n){
    return Array(n).fill().map((_, i) => i);
  }

  $: showTip = function (i) {
    active_hover = i
  }

  export let states;
  export let stateMeta;
  export let tmax;
  export let xmax;
  export let vline;
  export let timestep;
  export let N;
  export let ymax;
  export let InterventionTime;
  export let log = false;
  export let lastHistoricTime;
  export let icuCapacity;
  
  function lastHistoricTimeHelper() {
    return Math.min(Math.max(lastHistoricTime-1, 0), states.length-1)
  }

  function shouldWeDrawICUcapacity(stateMeta, ymax) {
    // Note that we need stateMeta and ymax as parameters in order to trigger re-render on certain user actions.
    var icuVisible = false
    var areStatesBelowICUvisible = false
    for (var i=0; i<stateMeta.length; i++) {
      const state = stateMeta[i]
      const visible = state["checked"]
      if (state["key"] === "icu" && visible) {
        icuVisible = true
      } else if (icuVisible && visible) {
        // For example, if fatality bars are drawn below ICU bars,
        // it doesn't make sense to show the ICU capacity bar as a straight line.
        return false
      }
    }
    if (!icuVisible) {
      // If ICU has not been checked visible, we don't care about ICU capacity.
      return false
    }
    const pixelsFromBottom = yScale(0) - yScale(icuCapacity)
    if (pixelsFromBottom < 10) {
      // ICU capacity is so close to the x axis (due to y-scale) that it does not make sense to draw it.
      return false
    }
    const pixelsFromTop = yScale(icuCapacity)
    if (pixelsFromTop <= 0) {
      // ICU capacity is at the edge of the chart or beyond it, does not make sense to draw.
      return false
    }
    return true
  }

  function getBarY(state, stateMeta, j) {
    var sumOfHeights = 0
    for (var i=j; i<stateMeta.length; i++) {
      sumOfHeights += getBarHeight(state, stateMeta, i)
    }
    return sumOfHeights
  }

  function getBarHeight(state, stateMeta, j) {
    if (!stateMeta[j]["checked"]) {
      return 0
    }
    const k = stateMeta[j]["key"]
    return state[k]
  }

  const padding = { top: 20, right: 0, bottom: 20, left: 25 };

  let width  = 750;
  let height = 420;

  $: xScale = scaleLinear()
    .domain([0, states.length])
    .range([padding.left, width - padding.right]);

  $: xScaleTime = scaleLinear()
    .domain([0, tmax])
    .range([padding.left, width - padding.right]);

  $: indexToTime = scaleLinear()
    .domain([0, states.length])
    .range([0, tmax])

  $: timeToIndex = scaleLinear()
    .domain([0, tmax])
    .range([0, states.length])

  $: yScale = (log ? scaleLog(): scaleLinear())
    .domain([log ? 1: 0,  ymax/1])
    .range([height - padding.bottom, padding.top]);

  $: yScaleL = scaleLog()
    .domain([1,  ymax/1])
    .range([0, height - padding.bottom - padding.top]);


  $: innerWidth = width - (padding.left + padding.right);
  $: barWidth = innerWidth / states.length - 1.5;
  $: active_hover = -1
  $: lock = false
  var active_lock = 0

  $: active = (function () {
    if (lock){
      var i = Math.round(timeToIndex(active_lock))
      if (i > 99) {
        lock = false
        i = 0
      } else {
        return i
      }
    } else {
      return active_hover
    }
  })()
  export let active;
  export let checked;

  // var data = [[2   , 2  ], [5   , 2  ], [18  , 4  ], [28  , 6  ], [43  , 8  ], [61  , 12 ], [95  , 16 ], [139 , 19 ], [245 , 26 ], [388 , 34 ], [593 , 43 ], [978 , 54 ], [1501, 66 ], [2336, 77 ], [2922, 92 ], [3513, 107], [4747, 124]]
  var data = []
</script>

<style>
  h2 {
    text-align: center;
    font-size: 30px;
    font-weight: 300;
    font-family: nyt-franklin,arial,helvetica,sans-serif;
    font-style: normal; 
  }

  .chart {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding-top:30px;
    padding-bottom:10px;
  }

  svg {
    position: relative;
    width: 100%;
    height: 450px;
  }

  .tick {
    font-family: Helvetica, Arial;
    font-size: .725em;
    font-weight: 200;
  }

  .tick line {
    stroke: #e2e2e2;
    stroke-dasharray: 2;
  }

  .tick text {
    fill: #aaa;
    text-anchor: start;
  }

  .tick.tick-0 line {
    stroke-dasharray: 0;
  }

  .intervention line {
    stroke: #555;
    stroke-dasharray: 0;
    stroke-width:12.5;
  }


  .x-axis .tick text {
    text-anchor: middle;
  }

  .bar {
    stroke: none;
    opacity: 0.65
  }

  .total {
    color: #888;
    font-family: Helvetica, Arial;
    font-size: .725em;
    font-weight: 200;
  }


  a.tip span:before{
      content:'';
      display:block;
      width:0;
      height:0;
      position:absolute;

      border-top: 8px solid transparent;
      border-bottom: 8px solid transparent;
      border-right:8px solid black;
      left:-8px;

      top:7px;
  }

</style>

<div style="width:{width+15}px; height: {height}px; position: relative; top:20px">

  {#if shouldWeDrawICUcapacity(stateMeta, ymax)}
    <div style="position: absolute;
                top: {Math.max(yScale(icuCapacity),0)}px;
                left: 30px;
                width: {width - 30}px;
                height: 1px;
                border-top: 1px solid black;">
    </div>
  {/if}

  <svg style="position:absolute; height: {height}px">

    <!-- y axis -->
    <g class="axis y-axis" transform="translate(0,{padding.top})">
      {#each yScale.ticks(5) as tick}
        <g class="tick tick-{tick}" transform="translate(0, {yScale(tick) - padding.bottom})">
          <line x2="100%"></line>
          <text y="-4">{Number.isInteger(Math.log10(tick)) ? formatNumber(tick) : (log ? "": formatNumber(tick))}{ (tick == yScale.ticks(5)[0]) ? " ": ""}</text>
        </g>
      {/each}
    </g>

    <!-- x axis -->
    <g class="axis x-axis">
      {#each xScaleTime.ticks() as i}
        <g class="tick" transform="translate({xScaleTime(i)},{height})">
          <text x="0" y="-4">{i == 0 ? "Day ":""}{i}</text>
        </g>
      {/each}
    </g>

    <g class='bars'>
      {#each range(states.length) as i}
        <rect
          on:mouseover={() => showTip(i)}
          on:mouseout={() => showTip(-1)}
          on:click={() => {lock = !lock; active_lock = indexToTime(i) }}
          class="bar"
          x="{xScale(i) + 2}"
          y="{0}"
          width="{barWidth+3}"
          height="{height}"
          style="fill:white; opacity: 0">     
        </rect>

        {#each range(stateMeta.length) as j}
          {#if !log}
            {#if states[i][stateMeta[j]["key"]] > 0}
              <rect
                on:mouseover={() => showTip(i)}
                on:mouseout={() => showTip(-1)}
                on:click={() => {lock = !lock; active_lock = indexToTime(i) }}
                class="bar"
                x="{xScale(i) + 2}"
                y="{yScale(getBarY(states[i], stateMeta, j))}"
                width="{barWidth}"
                height="{Math.max(height - padding.bottom - yScale(getBarHeight(states[i], stateMeta, j)), 0)}" 
                style="fill:{stateMeta[j]['color']}; opacity:{active == i ? 0.9: 0.6}">     
              </rect>
            {/if}
          {:else}
          <!-- This commented out block is for log scale.
                <rect
                on:mouseover={() => showTip(i)}
                on:mouseout={() => showTip(-1)}
                on:click={() => {lock = !lock; active_lock = indexToTime(i) }}
                class="bar"
                x="{xScale(i) + 2}"
                y="{(function () { 
                        var z = yScale( sum(y[i].slice(0,j+1), checked) ); 
                        return Math.min(isNaN(z) ? 0: z, height - padding.top)
                      })()  
                    }"
                width="{barWidth}"
                height="{(function () {
                  var top = yScaleL( sum(y[i].slice(0,j+1),checked) + 0.0001 )
                  var btm = yScaleL( sum(y[i].slice(0,j),checked) + 0.0001)
                  var z = top - btm; 
                  if (z + yScale( sum(y[i].slice(0,j+1), checked) ) > height - padding.top) {
                    return top
                  } else {
                    return Math.max(isNaN(z) ? 0 : z,0)
                  }})()}" 
                style="fill:{colors[j]};
                       opacity:{active == i ? 0.9: 0.6}">     
              </rect> -->
          {/if}
        {/each}

      {/each}
    </g>

    <g class='bars'>
      {#each range(data.length) as i}
        <rect
          class="bar"
          x="{xScale( i+28 ) + 2}"
          y="{yScale( data[i][1] )}"
          width="{barWidth}"
          height="{height - padding.bottom - yScale( data[i][1] )}"
          style="fill:black; 
                 opacity: 0.5;
                 box-shadow: 4px 10px 5px 2px rgba(0,0,0,0.75);">     
        </rect>
      {/each}
    </g>

  </svg> 

  <div style="position: absolute;width:{width+15}px; height: {height}px; position: absolute; top:0px; left:0px; pointer-events: none">
    
    <!-- Pointer to active bar. -->
    {#if active >= 0}
      <div style="position:absolute; 
                  pointer-events: none;
                  width:100px;
                  left:{xScale(active)}px;
                  top:{Math.max(yScale(getBarY(states[active], stateMeta, 0)),0) }px" class="tip"> 
          <svg style="position:absolute; top:-12px; left:0px" height="10" width="10">
          <path 
            d="M 0 0 L 10 0 L 5 10 z"
            fill="{lock ? '#555':'#AAA'}" 
            stroke-width="3" />
          </svg>
      </div>
    {/if}

    <!-- Last historical datapoint marker. -->
    <div id="historicalMarker" style="pointer-events: none;
              position: absolute;
              top: 20px;
              left:{xScale(lastHistoricTimeHelper()) + 3}px;
              visibility: 'visible';
              width:2px;
              background-color:#FFF;
              border-right: 1px dashed plum;
              height: {Math.max(yScale(getBarY(states[lastHistoricTimeHelper()], stateMeta, 0)),0) - 30}px;">
    </div>
    <div style="position:absolute; 
                  pointer-events: none;
                  width:100px;
                  left:{xScale(lastHistoricTimeHelper())}px;
                  top:{Math.max(yScale(getBarY(states[lastHistoricTimeHelper()], stateMeta, 0)),0) }px" class="tip"> 
          <svg style="position:absolute; top:-12px; left:0px" height="10" width="10">
          <path 
            d="M 0 0 L 10 0 L 5 10 z"
            fill="plum" 
            stroke-width="3" />
          </svg>
    </div>

  </div>

</div>
