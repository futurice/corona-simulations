<script>

    import { onMount } from 'svelte';

    import { scaleLinear } from 'd3-scale';
    import { format } from 'd3-format';
    import { drag } from 'd3-drag';
    import { selectAll } from 'd3-selection';

    import { math_inline, math_display, formatDelta, padding, SHOW_FUTURE } from '../utils.js';

    export let width;
    export let height;
    export let R0;
    export let Pmax;
    export let tmax;
    export let InterventionTime;
    export let InterventionAmt;
    export let OMInterventionAmt;
    export let Plock;
    export let lock;
    export let lock_yaxis;
    export let P_all_historical;
    export let demo_mode;

    $: xScaleTime = scaleLinear()
                        .domain([0, tmax])
                        .range([padding.left, width - padding.right]);

    $: xScaleTimeInv = scaleLinear()
                        .domain([0, width])
                        .range([0, tmax]);

    var drag_intervention = function (){
        var dragstarty = 0
        var InterventionTimeStart = 0

        var dragstarted = function (d) {
            dragstarty = event.x  
            InterventionTimeStart = InterventionTime
            Plock = Pmax
            lock = true
        }

        var dragged = function (d) {
            // InterventionTime = Math.max( (*(1 + (event.x - dragstarty)/500)), 10)
            // console.log(event.x)
            const minX = (demo_mode === SHOW_FUTURE ? 0 : P_all_historical.length)
            InterventionTime = Math.min(tmax-1, Math.max(minX, InterventionTimeStart + xScaleTimeInv(event.x - dragstarty)))
        }

        var dragend = function (d) {
            lock = false
        }

        return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
    }

    var drag_intervention_end = function (){
        var dragstarty = 0
        var durationStart = 0

        var dragstarted = function (d) {
            dragstarty = event.x  
            durationStart = duration
            Plock = Pmax
            lock = true
        }

        var dragged = function (d) {
            // InterventionTime = Math.max( (*(1 + (event.x - dragstarty)/500)), 10)
            // console.log(event.x)
            const minX = (demo_mode === SHOW_FUTURE ? 0 : P_all_historical.length)
            duration = Math.min(tmax-1, Math.max(minX, durationStart + xScaleTimeInv(event.x - dragstarty)))
        }

        var dragend = function (d) {
            lock = false
        }

        return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
    }

    onMount(async () => {
        var drag_callback_intervention = drag_intervention()
        drag_callback_intervention(selectAll("#dottedline"))
    });

</script>

<style>

    .caption {
        font-family: nyt-franklin,helvetica,arial,sans-serif;
        font-size: 13px;    
    }

    /* TODO move copypasted CSS to global.css */

    .legendtext{
        color:#888; 
        font-size:13px;
        padding-bottom: 5px;
        font-weight: 300;
        font-family: nyt-franklin,helvetica,arial,sans-serif;
        line-height: 14px;
    }

    :global(.unselectable){
        -webkit-user-select: none; /* Safari */        
        -moz-user-select: none; /* Firefox */
        -ms-user-select: none; /* IE10+/Edge */
        user-select: none; /* Standard */
    }


    .paneltext{
        position:relative;
        height:130px;
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

</style>

<!-- Intervention Line -->
<div style="position: absolute; width:{width+15}px; height: {height}px; position: absolute; top:100px; left:10px; pointer-events: none">
    <div id="dottedline" style="pointer-events: all;
                                position: absolute;
                                top:-38px;
                                left:{xScaleTime(InterventionTime)}px;
                                visibility: {(xScaleTime(InterventionTime) < (width - padding.right)) ? 'visible':'hidden'};
                                width:2px;
                                background-color:#FFF;
                                border-right: 1px dashed black;
                                pointer-events: all;
                                cursor:col-resize;
                                height:{height+19}px">

        <div style="width:150px; position:relative; top:-85px; height: 80px; padding-right: 15px; left: 0px; ;cursor:col-resize; background-color: white; position:absolute" >
        </div>
    </div>
</div>

<!-- Intervention Line slider -->
<div style="position: absolute; width:{width+15}px; height: {height}px; position: absolute; top:120px; left:10px; pointer-events: none">
    <div style="
                position: absolute;
                top:-38px;
                left:{xScaleTime(InterventionTime)}px;
                visibility: {(xScaleTime(InterventionTime) < (width - padding.right)) ? 'visible':'hidden'};
                width:2px;
                background-color:#FFF;
                border-right: 1px dashed black;
                cursor:col-resize;
                height:{height}px">
        <div style="flex: 0 0 160px; min-width:200px; position:relative; top:-125px; left: 1px" >
            <div class="caption" style="pointer-events: none; position: absolute; left:0; top:40px; height: 60px; min-width:200px; border-left: 3px solid #777; padding: 5px 7px 7px 7px; ">      
                <div class="paneltext" style="height:20px; text-align: right">
                    <!--<div style="position: absolute; top: -32px; font-size: 40px; left: -15px; color: #777">→</div>-->
                    <div class="paneltitle unselectable" style="top:0px; position: relative; text-align: left">
                        Action on day {format("d")(InterventionTime)}
                    </div>
                    <div class="paneldesc unselectable">
                        <span style="color: {InterventionAmt < 1 ? '#4daf4a' : '#f0027f'}">
                            {formatDelta(-100*(1-InterventionAmt))}%
                        </span>
                        transmission
                        <span style="font-size: 11px;">
                            ({@html math_inline("\\mathcal{R}_0=" + (R0*InterventionAmt).toFixed(2) )})
                        </span>
                    </div>
                </div>
                <div style="pointer-events: all; position: relative; top: 20px; width: 150px;">
                    <input class="range" type=range bind:value={OMInterventionAmt} min=-1 max=1 step=0.01 on:mousedown={lock_yaxis}>
                </div>
            </div>
        </div>
    </div>
</div>