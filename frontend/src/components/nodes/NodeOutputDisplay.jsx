import React from 'react';
import Markdown from 'react-markdown';

const NodeOutputDisplay = (props) => {
    const { node, data } = props;
    const output = data?.run || node?.data?.run;


    return (
        <div>
            {output ? (
                <div>
                    {Object.entries(output).map(([key, value]) => (
                        <div key={key} className="my-2 flex flex-col items-start">
                            <label className="text-sm font-semibold mb-1 block">{key}:</label>
                            <div className="ml-2 mt-auto">
                                <Markdown>{String(value)}</Markdown>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div>No output available</div>
            )}
        </div>
    );
};

export default NodeOutputDisplay;