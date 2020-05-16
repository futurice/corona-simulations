<script>

    import Icon from 'svelte-awesome';
    import { flask, question } from 'svelte-awesome/icons';

    import { math_inline, math_display, padding, stylizeExpressions } from '../utils.js';

    export let p;
    export let value;
    export let popupHTML;

    export let specialCaseAddToDisplayValue = 0;
    
    $: displayValue = value + specialCaseAddToDisplayValue
    $: valueFormatted = p.isInteger ? displayValue : (p.isPercentage ? (100*displayValue).toFixed(2) : displayValue.toFixed(2))

    function f(chapterTitle, chapterText) {
        if (chapterTitle === '' || chapterText === '') {
            return ""
        }
        return `<p><b>${stylizeExpressions(chapterTitle)}</b></p><p>${stylizeExpressions(chapterText)}</p>`
    }

    function displayPopup() {
        popupHTML = `${f(p.description, p.longformDescription)}
                     ${f("Should not be confused with", p.longformDoNotConfuseWith)}
                     ${f("Effects", p.longformEffects)}
                     ${f("Justification for default value", p.longformDefaultValueJustification)}`
    }

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

</style>

<div class="paneltext">
    <div class="paneldesc" style="min-height: 35px;">

        <div style="position: absolute; margin-right: 10px;">
            {@html stylizeExpressions(p.description)}
        </div>

        <div on:click={displayPopup} title="Learn more">
            <Icon data={question}
            scale=1.0
            class="clickableIcons"
            style="cursor: pointer; color: #CCC; position: absolute; right: 1px; top: 0px;"
            />
        </div>

        <!-- Default value 'D' button (or flask, if default value is automatically generated from data) -->
        {#if p.isDefaultValueAutomaticallyGeneratedFromData}
            <div on:click={() => value = p.defaultValue} title="Estimate from data">

                <!-- This if/else is a workaround to a Svelte bug which would otherwise prevent us from changing the color of the SVG. -->
                {#if value === p.defaultValue}
                    <Icon data={flask} scale=0.8 class="flaskIcon" style="color: #003399; position: absolute; right: 0px; top: 20px;" />
                {:else}
                    <Icon data={flask} scale=0.8 class="flaskIcon" style="color: #CCC; position: absolute; right: 0px; top: 20px;" />
                {/if}

            </div>
        {:else}
            <div on:click={() => value = p.defaultValue} title="Default value" style="font-size: 16px;">
                <button class="clickableIcons unselectable"
                        style="color: {value === p.defaultValue ? '#777' : '#CCC'};
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
    {valueFormatted} {p.unitsDescriptor}
</div>
<input class="range" type=range bind:value={value} min={p.minValue} max={p.maxValue} step={p.stepValue}>