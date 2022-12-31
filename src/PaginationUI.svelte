<script lang="ts">
    export let page: number
    export let totalPages = 0
    export let maxResultsPerPage = 0
    export let totalResults = 0
    export let show = "page"
    export let showPageIndices = false
    export let sorted = false
    export let backIcon = "◄"
    export let forwardIcon = "►"

    function handlePageBack() {
        if(page <= 1) return
        page = page - 1
    }

    function handlePageForward() {
        if(page >= totalPages) return
        page = page + 1
    }

    function determinePageIndices(): (number | ". . .")[] {
        if(!showPageIndices) return

        let ret: (number | ". . .")[] = []

        //If the total number of pages is < 7
        if(totalPages < 7) {
            for(let i = 1; i <= totalPages; i++) {
                ret.push(i)
            }

            return ret
        }
        
        for(let i=1; i <= totalPages; i++) {
            //If the page is 1, current page, total pages, or within 2 of each
            if(i <= 2 || (totalPages - i) < 2 || Math.abs(page - i) < 2) {
                ret.push(i)
                continue
            }

            //Push ... and find next relevant page
            if(ret[ret.length - 1] !== ". . .") {
                ret.push(". . .")
            }
        }

        return ret
    }

    
    let pageIndices: (number | ". . .")[] = []
    $: sorted || page, pageIndices = determinePageIndices()
    $: lastResult = (maxResultsPerPage * (page - 1))+ maxResultsPerPage
</script>

<div class="pagination-ui">
    <div class="forward-back">
        <div class="page-arrow left-arrow" class:disabled={page <= 1} on:click={handlePageBack} on:keypress>{@html backIcon}</div>
        {#if show === "page" && totalPages}
            <div class="page-note">{page}/{totalPages}</div>
        {:else if show === "results" && maxResultsPerPage && totalResults}
            <div class="page-note">{maxResultsPerPage * (page - 1) + 1}-{lastResult > totalResults ? totalResults : lastResult} of {totalResults}</div>
        {/if}
        <div class="page-arrow right-arrow" class:disabled={page >= totalPages} on:click={handlePageForward} on:keypress>{@html forwardIcon}</div>
    </div>
    {#if showPageIndices && totalPages && totalPages > 1}
        <div class="page-select">
            {#each pageIndices as pnum}
                <span class="to-page">
                    {#if pnum === ". . ." || pnum === page}
                        <span class:page-selected={typeof pnum === "number"}>{pnum}</span>
                    {:else}
                        <a href="page-{pnum}" on:click|preventDefault={()=> {if(pnum !== ". . .") page = pnum}}>{pnum}</a>
                    {/if}
                </span>
            {/each}
        </div>
    {/if}
</div>

<style>
    .page-select {
        text-align: center;
    }

    .page-arrow {
        cursor: pointer;
        user-select: none;
    }

    .to-page + .to-page {
        margin-left: 1rem;
    }

    .forward-back {
        display: flex;
        justify-content: center;
    }

    .forward-back > * + * {
        margin-left: 1rem;
    }
</style>