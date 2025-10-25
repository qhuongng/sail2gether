import { Link } from "react-router-dom";

import Button from "@/components/button";

const NotFound = () => {
    return (
        <div className="flex flex-col justify-center min-h-screen max-w-3xl mx-auto p-12">
            <h1 className="text-3xl font-bold mb-8">This page doesn't exist. I think.</h1>
            <p>I wrote like, 3 pages... If I recall correctly.</p>

            <Link to="/">
                <Button title="Go home" className="mt-24">
                    Take me back, pls
                </Button>
            </Link>
        </div>
    );
};

export default NotFound;
