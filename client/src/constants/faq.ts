import type { FAQItem } from "@/types/faq";

export const faqData: FAQItem[] = [
    {
        title: `<span class="font-semibold">What's this?</span>`,
        content: `
      <p>Recently (circa October 2025), my friend and I have decided to watch a movie together every weekend. Problem is, we live half a world apart. Sharing the screen over video conferencing apps means that one of us will always suffer from poor video and audio quality, and Teleparty only supports legit sources which we c<b>ARRRRRGHHH</b> 🏴‍☠️ So, yeah, I spent a day making this. The app name is definitely not a reference btw.</p>
      <p class="mt-4">It was also a good opportunity to explore some tools I didn't have time to check out before, like Firebase and Cloudflare R2. Frankly, I was also lazy and cheap, so this app is essentially just a React client (no server needed yay).</p>
    `,
    },
    {
        title: `<span class="font-semibold">How does this work?</span>`,
        content: `
      <p>I assume that you're asking about the <i>inner workings</i> of this site (that's why it's a NFAQ). Essentially, the video the host uploads will be stored in a Cloudflare R2 bucket and made accessible via a public URL (I wrote a Cloudflare worker to help with that, it was pretty cool). Said URL is then made source of a <b>&lt;video&gt;</b> element. The current timestamp and some event flags will be synced frequently to Firebase from the host's client, and the viewer's client listens to them. Voilà.</p>
    `,
    },
    {
        title: `<span class="font-semibold">Is my data safe? Is it private?</span>`,
        content: `
      <p>Well, you can choose to remove a room you host, and everything should be deleted from Firebase and the Cloudflare R2 bucket. And I have no incentive to sell your illeg<b>ARRRRRGHHH</b> 🏴‍☠️ media anyway, so don't worry.</p>
      <p class="mt-4">One thing to note is that the list of rooms you host will be stored in your browser's <i>localStorage</i>. So please remove all the rooms before clearing your browsing data, or all the room info and videos will not be deleted. None of your personal information is ever recorded or stored in the servers, though.</p>
    `,
    },
    {
        title: `<span class="font-semibold">What's the tech staaaaaaaaaaaaack?</span>`,
        content: `
      <p>This is definitely not a 'frequently asked question' LOL. But oh well, something something 'archive my work for future reference'.</p>
      <p class="font-semibold mt-4">Front end:</p>
      <ul class="list-disc list-inside">
        <li><a href="https://vitejs.dev/" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2 hover:text-neutral-500 transition-colors duration-200 ease-in-out">Vite</a> + React + TypeScript</li>
        <li><a href="https://tailwindcss.com/" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2 hover:text-neutral-500 transition-colors duration-200 ease-in-out">TailwindCSS</a> + <a href="https://daisyui.com/" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2 hover:text-neutral-500 transition-colors duration-200 ease-in-out">DaisyUI</a></li>
        <li><a href="https://zustand-demo.pmnd.rs/" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2 hover:text-neutral-500 transition-colors duration-200 ease-in-out">Zustand</a></li>
      </ul>
      <p class="font-semibold mt-4">Back end:</p>
      <ul class="list-disc list-inside">
        <li>🐦‍⬛🐦‍⬛🐦‍⬛</li>
        <li>Just kidding, <a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2 hover:text-neutral-500 transition-colors duration-200 ease-in-out">Cloudflare</a> for the R2 Object Store</li>
        <li><a href="https://firebase.google.com" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2 hover:text-neutral-500 transition-colors duration-200 ease-in-out">Firebase</a> for the real-time database and hosting</li>
      </ul>
    `,
    },
    {
        title: `<span class="font-semibold">Who are you?</span>`,
        content: `
      <p>You can check out my <a href="https://github.com/qhuongng" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2 hover:text-neutral-500 transition-colors duration-200 ease-in-out">GitHub</a> here. Other than that, I only lurk on social media, so there's nothing to see there LOL.</p>
    `,
    },
];
