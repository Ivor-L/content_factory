# Plan: Implement Sequential Dismantling and Replication on Homepage

The goal is to modify the "One-Click" trigger on the dashboard homepage to execute a sequential process: Upload Video -> Breakdown (Explosive Dismantling) -> Wait for Completion -> Replication.

## Steps

1.  **Modify `app/(main)/dashboard/components/HomeContent.tsx`**:
    -   Import `createScript` from `@/app/(main)/scripts/actions`.
    -   Add state variables:
        -   `isProcessing`: boolean
        -   `processingStep`: string ('idle', 'uploading', 'creating_script', 'breakdown', 'replication')
        -   `progress`: number (0-100)
    -   Update `handleExecute` function for `mode === 'one-click'`:
        -   **Step 1: Upload Video**:
            -   If `file` is present, upload to `/api/upload` to get `videoUrl`.
            -   If `inputValue` is a URL, use it directly.
        -   **Step 2: Create Script**:
            -   Call `createScript` with `videoUrl` and a default title (e.g., "Homepage Upload - [Date]").
            -   Get the new `scriptId`.
        -   **Step 3: Trigger Breakdown**:
            -   Call `POST /api/scripts/breakdown` with `scriptId`.
            -   Update status to "Analyzing video...".
        -   **Step 4: Poll Status**:
            -   Poll `/api/scripts/[scriptId]/status` every 2-3 seconds.
            -   Update progress bar based on status.
            -   Wait until status is `completed`.
            -   If status is `failed`, show error and stop.
        -   **Step 5: Trigger Replication**:
            -   Call `POST /api/replication/generate` with:
                -   `scriptId`
                -   `productId`
                -   `targetCountry` (mapped from state)
                -   `targetLanguage` (mapped from state)
                -   `duration`
                -   `quantity`
            -   Get `replicationId` from response.
        -   **Step 6: Completion**:
            -   Redirect user to `/replication/[replicationId]`.
            -   Show success toast.

2.  **Verify**:
    -   Test the flow with a sample video upload.
    -   Ensure status updates are visible.
    -   Ensure redirection works.
