import { createBrowserRouter } from "react-router-dom";

import RootLayout from "@/pages/layouts/root";

import Home from "@/pages/home";
import Room from "@/pages/room";
import NotFound from "@/pages/not-found";
import FAQ from "@/pages/faq";

const router = createBrowserRouter([
    {
        element: <RootLayout />,
        errorElement: <NotFound />,
        children: [
            {
                path: "/",
                element: <Home />,
            },
            {
                path: "/room/:id",
                element: <Room />,
            },
            {
                path: "/faq",
                element: <FAQ />,
            },
        ],
    },
]);

export default router;
