'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="page"><div className="error-box"><h2>The summit is temporarily out of reach.</h2><p>We couldn’t load this page. Please try again.</p><button className="button" onClick={reset}>Try again</button></div></div>}
