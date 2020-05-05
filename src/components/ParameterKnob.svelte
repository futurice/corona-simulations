<script>

    import Icon from 'svelte-awesome';
    import { flask, question } from 'svelte-awesome/icons';

    import { math_inline, math_display, padding } from '../utils.js';

    export let description;
    export let value;
    export let minValue;
    export let maxValue;
    export let stepValue;
    export let defaultValue;
    export let unitsDescriptor = '';
    export let isInteger = false;
    export let isPercentage = false;
    export let isDefaultValueAutomaticallyGeneratedFromData = false;

    $: valueFormatted = isInteger ? value : (isPercentage ? (100*value).toFixed(2) : value.toFixed(2))

</script>

<style>

    :global(.flaskIcon:hover) {
        cursor: pointer;
        color: #003399 !important;
    }

    .range {
        width: 100%;
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

</style>

<div class="paneltext">
    <div class="paneldesc" style="min-height: 35px;">
        {@html description}
        <!-- Measure of contagiousness: the number of secondary infections each infected individual produces. -->

        <div on:click={() => {}} title="Learn more">
            <Icon data={question}
            scale=1.0
            class="clickableIcons"
            style="cursor: pointer; color: #CCC; position: absolute; right: 1px; top: 0px;"
            />
        </div>

        <!-- Default value 'D' button (or flask, if default value is automatically generated from data) -->
        {#if isDefaultValueAutomaticallyGeneratedFromData}
            <div on:click={() => value = defaultValue} title="Estimate from data">

                <!-- This if/else is a workaround to a Svelte bug which would otherwise prevent us from changing the color of the SVG. -->
                {#if value === defaultValue}
                    <Icon data={flask} scale=0.8 class="flaskIcon" style="color: #003399; position: absolute; right: 0px; top: 20px;" />
                {:else}
                    <Icon data={flask} scale=0.8 class="flaskIcon" style="color: #CCC; position: absolute; right: 0px; top: 20px;" />
                {/if}

            </div>
        {:else}
            <div on:click={() => value = defaultValue} title="Default value" style="font-size: 16px;">
                <button class="clickableIcons unselectable"
                        style="color: {value === defaultValue ? '#777' : '#CCC'};
                               position: absolute;
                               right: 0px;
                               top: 20px;
                               background: none;
                               border: none;
                               outline: none;
                               padding: 0;
                               font-weight: bold;">
                    D
                </button>
            </div>
        {/if}
    </div>
</div>
<div class="slidertext">
    {valueFormatted} {unitsDescriptor}
</div>
<input class="range" type=range bind:value={value} min={minValue} max={maxValue} step={stepValue}> 