/*****

node-red-contrib-google-actionflow - A Node Red node to handle actions from Google Actions

MIT License

Copyright (c) 2017 Dean Cording

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/



module.exports = function(RED) {
    "use strict";


    const DialogflowApp = require('actions-on-google').DialogflowApp;

    const express = require('express');
    const https = require("https");
    const fs = require('fs');


    const bodyParser = require('body-parser');

    // Map of app handlers
    // DialogflowApp can't be cloned so we need to keep a central copy.

    var appMap = new Map();

    function GoogleActionDialogflowIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        node.url = n.url || '/';
        node.port = n.port || 8081;
        node.key = n.key || '';
        node.cert = n.cert || '';
        node.ca = n.ca || '';

        const options = {
            key: fs.readFileSync(node.key),
            cert: fs.readFileSync(node.cert),
            ca: fs.readFileSync(node.ca),
        };

                // Create new http server to listen for requests
        var expressApp = express();
        expressApp.use(bodyParser.json({ type: 'application/json' }));
        node.httpServer = https.createServer(options, expressApp);

        // Handler for requests
        expressApp.all(node.url, (request, response) => {

            var app = new DialogflowApp({ request, response });

            app.handleRequest(function() {

                appMap.set(app.getUser().userId, app);

                var msg = {topic: node.topic,
                            conversationId: app.getUser().userId,
                            intent: app.getIntent(),
                            userId: app.getUser().userId,
                            context: app.getContexts(),
                            // dialogState: app.getDialogState(),
                            closeConversation: true,
                        };

                switch(msg.intent) {
                    case 'actions.intent.OPTION':
                        msg.payload = app.getSelectedOption();
                        break;
                    default:
                        msg.payload = app.getRawInput();
                }


                node.send(msg);

                node.trace("request: " + msg.payload);

            });
        });

        // Start listening
        node.httpServer.listen(node.port);

        // Stop listening
        node.on('close', function(done) {
            node.httpServer.close(function(){
                done();
            });
        });

    }
    RED.nodes.registerType("google-action-dialogflow in",GoogleActionDialogflowIn);


    function GoogleActionDialogflowOut(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        this.on("input",function(msg) {

            var app = appMap.get(msg.conversationId);

            if (app) {
                if (msg.closeConversation) {
                    app.tell(msg.payload.toString());
                    appMap.delete(msg.conversationId);
                } else {
                    app.ask(msg.payload.toString(), msg.dialogState);
                }
            } else {
                node.warn("Invalid conversation id");
            }
        });
    }
    RED.nodes.registerType("google-action-dialogflow response",GoogleActionDialogflowOut);
}
