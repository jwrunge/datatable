<script>
    import { fade, scale } from 'svelte/transition'
    import { createEventDispatcher } from 'svelte'

    let dispatch = createEventDispatcher()

    export let closable = true
    export let heading = ""
    export let loading = false
    export let wide = false
    export let fullwidth = false
</script>

<div in:fade={{duration: 200}} out:fade={{duration: 200}} class="datatable-modal background padding-2">
    <div in:scale={{duration: 200}} out:scale={{duration: 200}} class="inner bordered" class:wide={wide} class:full={fullwidth} on:click|stopPropagation>
        {#if closable}
            <div class="top-right">
                <div class="close-icon" on:click|stopPropagation={()=>{dispatch("close")}}>&times;</div>
            </div>
        {/if}
        {#if loading}
            <img src="/icons/load-image.svg" alt="loading" class="load-icon">
        {/if}
        <div class="scroller">
            {#if heading}
                <h2>{heading}</h2>
            {/if}
            <slot></slot>
        </div>
    </div>
</div>