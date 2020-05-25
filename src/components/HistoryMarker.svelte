<script>

    import { onMount, onDestroy } from 'svelte';

    import { scaleLinear } from 'd3-scale';
    import { format } from 'd3-format';
    import { drag } from 'd3-drag';
    import { selectAll } from 'd3-selection';
    import Icon from 'svelte-awesome';
    import { gear, trash } from 'svelte-awesome/icons';

    import { math_inline, math_display, formatDelta, padding } from '../utils.js';
    import { AM_NAME, AM_DAY, AM_EFFECT, AM_EXPANDED, ActionMarkerData } from '../action_marker_data.js';

    export let width;
    export let height;
    $: adjustedHeight = height+85;
    export let R0;
    export let Pmax;
    export let tmax;

    export let lastHistoricDay; // Marker can't be dragged beyond this
    export let cutoffHistoricDay; // Where marker is currently dragged to
    export let Plock;
    export let lock;
    export let lock_yaxis;
    export let flashMessage;

    function getLeftPx(cutoffHistoricDay, lastHistoricDay, tmax) {
        // Note: tmax must be in parameters to trigger re-render correctly.
        return xScaleTime(cutoffHistoricDay)
    }

    $: xScaleTime = scaleLinear()
                        .domain([0, tmax])
                        .range([padding.left, width - padding.right]);
    $: xScaleTimeInv = scaleLinear()
                        .domain([0, width])
                        .range([0, tmax]);
    $: leftPx = getLeftPx(cutoffHistoricDay, lastHistoricDay, tmax)
    $: leftPxHistoricalText = Math.min(leftPx-300, 0) // Allow this text to overflow to the left if needed

    var drag_intervention = function (){
        var dragstarty = 0
        var InterventionTimeStart = 0

        var dragstarted = function (d) {
            dragstarty = event.x  
            InterventionTimeStart = cutoffHistoricDay
            Plock = Pmax
            lock = true
        }

        var dragged = function (d) {
            const draggedX = InterventionTimeStart + xScaleTimeInv(event.x - dragstarty)
            const minX = 1
            const maxX = lastHistoricDay + 1
            if (draggedX > maxX+3) {
                flashMessage = 'Historical data is available up to day ' + lastHistoricDay
            } else {
                flashMessage = ''
            }
            cutoffHistoricDay = Math.round(Math.min(maxX, Math.max(minX, draggedX)))
        }

        var dragend = function (d) {
            lock = false
        }

        return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
    }

    onMount(async () => {
        var drag_callback_intervention = drag_intervention()
        drag_callback_intervention(selectAll(`#historyMarkerId`))
    });

    onDestroy(async () => {
        //console.log('destroyed')
    })

</script>

<style>

    .caption {
        font-size: 13px;    
    }

    /* TODO move copypasted CSS to global.css */

    .legendtext{
        color:#888; 
        font-size:13px;
        padding-bottom: 5px;
        font-weight: 300;
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
    }

    .paneldesc{
        color:#888; 
        text-align: left;
        font-weight: 300;
        padding-left: 1px;
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

</style>

<!-- Draggable elements of the History Marker should be placed here -->
<div style="position: absolute; width:{width+15}px; height: {height}px; top:-5px; left:10px; pointer-events: none;">

    <!-- Drag (clicking anywhere on this div will trigger drag, no other events) -->
    <div id={"historyMarkerId"} style="pointer-events: all;
                                position: absolute;
                                top:0px;
                                left:{leftPx}px;
                                width:2px;
                                background-color:#FFF;
                                border-right: 1px dashed black;
                                pointer-events: all;
                                cursor: col-resize;
                                height:{adjustedHeight}px;">

        

        <div style="top:-23px; left:-7px; position: absolute; text-align: right; width: 20px; height:20px; opacity: 0.3">
            <svg width="20" height="20">
                <g transform="rotate(90)">
                    <g transform="translate(0,-20)">
                    <path d="M2 11h16v2H2zm0-4h16v2H2zm8 11l3-3H7l3 3zm0-16L7 5h6l-3-3z"/>
                    </g>  
                </g>
            </svg>
        </div>


    </div>

    
</div>

<!-- Non draggable elements of the History Marker should be placed here (e.g. the visual curtain) -->
<div style="position: absolute;
            width:{leftPx+13}px;
            height: {adjustedHeight}px;
            top: -5px;
            left: 0px;
            pointer-events: none;
            background-color: #f0b402;
            opacity: 0.2">

            <div style="position: absolute; left: {leftPxHistoricalText}px; width: {leftPx+13-leftPxHistoricalText}px; text-align: right; margin-top: 10px; font-weight: normal; font-size: 20px;">
                <span style="margin-right: 10px">Historical estimates</span>
            </div>
            <div style="position: absolute; left: {leftPx+13}px; top: 0px; width: 200px; text-align: left; margin-top: 10px; margin-left: 10px; font-weight: normal; font-size: 20px;">
                Model predictions
                <br>
                <span style="font-size: 12px;">
                    {@html math_inline("→ \\mathcal{R}_0=" + R0.toFixed(2))}
                </span>
            </div>

</div>
