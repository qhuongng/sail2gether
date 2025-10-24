import { Link } from "react-router-dom";

const NotFound = () => {
    return (
        <div className="flex flex-col justify-center items-center min-h-screen">
            <h1 className="text-4xl font-bold">This page doesn't exist. I think.</h1>
            <p className="mt-12 text-lg">
                This site has like, 3 pages. Get back to your watch party.
            </p>
            <Link to="/" className="btn btn-lg border-2 border-base-300  mt-24">
                Go home
            </Link>
        </div>
    );
};

export default NotFound;
