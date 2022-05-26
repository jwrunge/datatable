<script>
    import {createEventDispatcher} from "svelte"
    const dispatch = createEventDispatcher()
    export let keyName = null
    export let objKey = null
    export let config
    export let value
    export let row
    export let width = null

    function isDisabled(determinant, row) {
        if(determinant === true) return true
        else if(!determinant) return false

        if(!row) return false

        if(determinant.operator == "===") {
            return row[determinant.field] === determinant.value
        }
        else if(determinant.operator == "==") {
            return row[determinant.field] == determinant.value
        }
        else if(determinant.operator == "<") {
            return row[determinant.field] < determinant.value
        }
        else if(determinant.operator == ">") {
            return row[determinant.field] > determinant.value
        }
        else if(determinant.operator == "<=") {
            return row[determinant.field] <= determinant.value
        }
        else if(determinant.operator == ">=") {
            return row[determinant.field] >= determinant.value
        }
        else if(determinant.operator == "!=") {
            return row[determinant.field] != determinant.value
        }

        else return false
    }

    function handleVariableValues(determinant, value) {
        if(!determinant || !Array.isArray(determinant)) return value

        for(let d of determinant) {
            if(d.operator == "===" && row[d.field] === d.value) {
                return d.result
            }
            else if(d.operator == "==" && row[d.field] == d.value) {
                return d.result
            }
            else if(d.operator == "<" && row[d.field] < d.value) {
                return d.result
            }
            else if(d.operator == ">" && row[d.field] > d.value) {
                return d.result
            }
            else if(d.operator == "<=" && row[d.field] <= d.value) {
                return d.result
            }
            else if(d.operator == ">=" && row[d.field] >= d.value) {
                return d.result
            }
            else if(d.operator == "!=" && row[d.field] != d.value) {
                return d.result
            }
        }

        return value
    }

    function handle_html(val) {
        if(config.html) {
            //Create element to get innerText
            let div = document.createElement("div")
            div.innerHTML = val
            let value = div.innerText

            return value
        }

        return val
    }
</script>

<!-- If the cell contains an editable field and objKey is not set and the value isn't an array or object itself -->
{#if config && config.editable && (!value || ((value && !Array.isArray(value)) && !(value && typeof value != "string" && Object.keys(value).length != 0))) }
    <td style="width: {width ? width : ""};">
        <!-- List responsive column name -->
        {#if keyName}
            <span class='only-responsive'>
                <strong>{ keyName }: </strong>
            </span>
        {/if}

        <!-- List object key (if source is an object property) -->
        {#if objKey}
            <span class="keyname left-pad"><em>{objKey}: </em></span>
        {/if}

        {#if config.editable.type == "text"}
            <input type="text" placeholder={config.editable.placeholder ? config.editable.placeholder : ""} disabled={isDisabled(config.editable.disabled, row)} bind:value={value} on:change={()=> { dispatch("updated") }}>
        {:else if config.editable.type == "number"}
            <input type="number" placeholder={config.editable.placeholder ? config.editable.placeholder : ""} disabled={isDisabled(config.editable.disabled, row)} bind:value={value} on:change={()=> { dispatch("updated") }}>
        {:else if config.editable.type == "date"}
            <input type="date" placeholder={config.editable.placeholder ? config.editable.placeholder : ""} disabled={isDisabled(config.editable.disabled, row)} bind:value={value} on:change={()=> { dispatch("updated") }}>
        {:else if config.editable.type == "select"}
            <!-- svelte-ignore a11y-no-onchange -->
            <select disabled={isDisabled(config.editable.disabled, row)} bind:value={value} on:change={()=> { dispatch("updated") }}> 
                {#each config.editable.options as opt}
                    <option default={opt.default ? true : false} disabled={opt.disabled ? true : false} value={opt.value}>{opt.show}</option>
                {/each}
            </select>
        {/if}
    </td>
<!-- If it's just a display cell -->
{:else}
    <td style="width: {width ? width : ""}; white-space: {handle_html(value) && handle_html(value).length > 30 ? "normal" : ""}; min-width: {handle_html(value) && handle_html(value).length > 30 ? "20em" : ""};">
        <!-- List responsive column name -->
        <span class='only-responsive'>
            <strong>{ keyName }: </strong>
        </span>

        <!-- List object key (if source is an object property) -->
        {#if objKey}
            <span class="keyname"><em>{objKey}: </em></span>
        {/if}

        <span class="left-pad" on:click={config.clickEvent ? config.clickEvent : null}>
            <!-- Handle variable values -->
            {#if config && config.variableValues}
                {#if config.clickable}
                    <!-- svelte-ignore a11y-invalid-attribute -->
                    <a href="" on:click|preventDefault={()=> { dispatch("fieldClick") }}>{handleVariableValues(config.variableValues, value)}</a>
                {:else}
                    {handleVariableValues(config.variableValues, value)}
                {/if}

            <!-- Display if value is an array -->
            {:else if value && typeof value !== "string" && Array.isArray(value) }
                {#if config && config.clickable}
                    <!-- svelte-ignore a11y-invalid-attribute -->
                    <a href="" on:click|preventDefault={()=> { dispatch("fieldClick") }}>Array ({value.length == 1 ? "1 value" : value.length + " values"})</a>
                {:else}
                    Array ({value.length == 1 ? "1 value" : value.length + " values"})
                {/if}
            <!-- Display if value is an object -->
            {:else if value && typeof value !== "string" && Object.keys(value).length}
                {#if config && config.clickable}
                    <!-- svelte-ignore a11y-invalid-attribute -->
                    <a href="" on:click|preventDefault={()=> { dispatch("fieldClick") }}>Object ({Object.keys(value).length == 1 ? "1 property" : Object.keys(value).length + " properties"})</a>
                {:else}
                    Object ({Object.keys(value).length == 1 ? "1 property" : Object.keys(value).length + " properties"})
                {/if}
            <!-- Value otherwise (if primitive) -->
            {:else if config && config.clickable && value !== null && value !== undefined && config.clickable != "drill"}
                {#if config && config.html}
                    <!-- svelte-ignore a11y-invalid-attribute -->
                    <a href="" on:click|preventDefault={()=> { dispatch("fieldClick") }}>{ @html value }</a>
                {:else}
                    <!-- svelte-ignore a11y-invalid-attribute -->
                    <a href="" on:click|preventDefault={()=> { dispatch("fieldClick") }}>{ value }</a>
                {/if}
            {:else if config && config.html}
                { @html value }
            {:else}
                { value }
            {/if}
        </span>
    </td>
{/if}