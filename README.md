# ⛵ sail2gether - No-frills synchronized video streaming web app

This is a side project built out of the need for high-quality, synchronized video playback between different devices, because I wanted to watch movies with friends half the world apart. :)

As for why it's named similar to a certain service with similar functionality... Let's just say I was inspired.

## General information

This repo consists of a **client** and a **Cloudflare worker**, which is part of the 'back end'.

The client is a **React + Vite + TypeScript** web app, where the user can host a room to watch videos in sync with other people. The user can also join existing rooms by entering the room ID, or via a share link. Hosts will be able to set a video in a room by uploading a local file (with the option to include a subtitle file), or by linking a video URL.

The 'back end' includes two services:

-   **Firebase's Realtime Database** for storing room, video, and subtitle data, as well as playback syncing.
-   **Cloudflare R2** for file storage. The worker handles uploading files to and serving them from an R2 object store bucket. Multipart upload is supported for large files (which is often the case for movies).

The client also has a video player component with custom controls. The viewer can see the video's current timestamp and duration, change the volume, mute/unmute, enable/disable subtitles, and toggle fullscreen, but they cannot play, pause, or seek the video, while the host can.

Information on rooms hosted by one user is stored on their browser's **localStorage**. No personal information is recorded or saved to any server.

## Demo

I would love to include the deployed app's URL here, but I'm honestly terrified of it being exploited (it's connected to Firebase and Cloudflare, after all). Feel free to clone this project and run your very own sail2gether, though. :D I think with some modifications this can totally be entirely self-hosted, and it might be a fun little pet project.

## Build & run the system locally

### Prerequisites

-   [Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
-   A Firebase project and Realtime Database URL

    -   First, [create a Firebase project](https://support.google.com/appsheet/answer/10104995?hl=en). In the Firebase Console for your project, click **+ Add app**, add a **web app** and copy the configuration object to set up the client later.
    -   Then, [enable the Realtime Database](https://firebase.google.com/docs/database/web/start) for your project. In the Firebase Console for your project, select **Build > Realtime Database** from the sidebar, click the **Rules** tab and edit the rules as follows:
        ```json
        {
            "rules": {
                "rooms": {
                    "$roomId": {
                        ".read": true,
                        ".write": true,
                        ".validate": "newData.hasChildren(['hostId', 'videoUrl', 'isPlaying', 'currentTime', 'playbackRate'])"
                    }
                }
            }
        }
        ```
    -   Copy the database URL from the **Data** tab to set up the client later.
    -   If you want to deploy the app to Firebase later, install the Firebase CLI as well:
        ```bash
        npm install -g firebase-tools
        ```

-   A [Cloudflare R2 bucket](https://workers.cloudflare.com/product/r2?utm_medium=cpc&utm_source=google&utm_campaign=2023-q4-acq-gbl-developers-r2-ge-general-paygo_mlt_all_g_search_bg_exp__dev&utm_content=r2&gclsrc=aw.ds&gad_source=1&gad_campaignid=20580233211&gbraid=0AAAAADnzVeRF97J9w8Q8HM0_jv7f0ebrR&gclid=CjwKCAjwx-zHBhBhEiwA7Kjq60r4HxObyUTO6YIts7YrmnJiGcIJBjC7824dVk6TXji0XAbiGEeeyxoCbOwQAvD_BwE)

    -   In the Cloudflare Console, select **Build > Storage & databases > R2 object storage > Overview**.
    -   Select your bucket, click the **Settings** tab, and enable the Public Development URL.
        -   Copy this URL to set up the client and worker later.

### Setting things up

#### Setting up and deploying the worker

-   Please refer to [this turorial by Cloudflare](https://developers.cloudflare.com/workers/tutorials/upload-assets-with-r2/) to set up the secret variable `SAIL2GETHER_R2_SECRET` for your worker. This will involve installing the Wrangler CLI, or you can use `npx wrangler` instead.

    -   Keep the secret for setting up the client later.

-   Make a copy of the `wrangler.example.jsonc` and rename it `wrangler.jsonc`. Modify the values according to the comments in the file, including the compatibility date, the bucket name, and the public URL.
-   With a terminal opened in the `r2_worker` directory, generate a secret for your bucket to use as authentication for upload requests.

    ```bash
        npx wrangler secret put "SAIL2GETHER_R2_SECRET"

        # alternatively, if you don't have Wrangler CLI installed

        npx wrangler secret put "SAIL2GETHER_R2_SECRET"
    ```

    -   Enter your secret according to the terminal prompt. Keep this value to set up the client later.

-   Create a KV namespace for multipart uploading metadata:

    ```bash
        wrangler kv namespace create "SAIL2GETHER_UPLOAD_METADATA"

        # alternatively, if you don't have Wrangler CLI installed

        npx wrangler kv namespace create "SAIL2GETHER_UPLOAD_METADATA"
    ```

    -   Follow the terminal prompts to complete setup and generate a binding from the namespace to your bucket in `wrangler.jsonc`.

-   Deploy the worker:

    ```bash
    wrangler deploy

    # or

    npx wrangler deploy
    ```

-   Copy the worker's URL to set up the client later.

#### Setting up and running the client

-   Make a copy of the `config.example.ts` file in the `client/src/constants` directory and rename it `config.ts`.
-   Replace the values with yours (the localStorage key doesn't need to be replaced).
-   Install dependencies:
    ```bash
    npm install
    ```
-   Run the project locally:
    ```bash
    npm run dev
    ```
-   Alternatively, if you want to deploy the project to Firebase:

    -   Log into Firebase using the CLI:
        ```bash
        firebase login
        ```
    -   Initiate the deployment:

        ```bash
        firebase init deploy
        ```

        -   When prompted, choose **Use an existing project** and pick the Firebase project you created earlier.
        -   Ensure that the public directory is set up as `dist`, the deployment is configured as a _single-page app_, and GitHub automatic builds and deploys is **not** enabled.

    -   Run the deploy command:
        ```bash
        npm run deploy
        ```
        -   After the deployment process is completed, you should see a URL in the terminal that you can use to access the app.

## To-do

After writing this README, I realized that getting this thing set up and running is a total nightmare LOL. I might or might not make a fully local version of this someday, or at least make use of services that require less setup (Google Drive 👀).
