const _ = require('lodash');
const rx = require('rxjs');
const rxop = require('rxjs/operators');

const {
    edge,
    validate
} = require('./schema');

module.exports = class Edge {
    constructor(args = {}) {
        const {
            value,
            error
        } = edge.constructor.validate(args);

        if (error) {
            throw error;
        }

        const {
            decrementPath,
            defaultDirection,
            defaultEntity,
            namespace,
            store
        } = value;

        this.decrementPath = decrementPath;
        this.defaultDirection = defaultDirection;
        this.defaultEntity = defaultEntity;
        this.namespace = namespace;
        this.link = this.link.bind(this);

        this.store = store;
        this.countEdges = this.store.countEdges.bind(this.store);
        this.deleteEdge = this.store.deleteEdge.bind(this.store);
        this.deleteEdges = this.store.deleteEdges.bind(this.store);
        this.getAll = this.store.getEdges.bind(this.store);
        this.getAllByDistance = this.store.getEdgesByDistance.bind(this.store);
        this.setEdge = this.store.setEdge.bind(this.store);
    }

    allAll(args = {}) {
        args = _.defaults({}, args, {
            direction: this.defaultDirection,
            distance: (collectionSize, fromNodeIndex, toNodeIndex) => {
                return collectionSize - Math.abs(fromNodeIndex - toNodeIndex);
            },
            entity: this.defaultEntity
        });

        return validate(edge.allAll, args)
            .pipe(
                rxop.mergeMap(args => {
                    const collectionSize = _.size(args.collection);

                    return rx.from(args.collection)
                        .pipe(
                            rxop.mergeMap((fromNode, fromNodeIndex) => {
                                return rx.from(args.collection)
                                    .pipe(
                                        rxop.map((toNode, toNodeIndex) => {
                                            if ((args.direction && fromNodeIndex === toNodeIndex) || (!args.direction && toNodeIndex <= fromNodeIndex)) {
                                                return null;
                                            }

                                            return {
                                                direction: args.direction,
                                                distance: _.isFunction(args.distance) ? args.distance(collectionSize, fromNodeIndex, toNodeIndex) : args.distance,
                                                entity: args.entity,
                                                fromNode,
                                                prefix: args.prefix,
                                                toNode
                                            };
                                        }),
                                        rxop.filter(response => !_.isNull(response))
                                    );
                            }),
                            rxop.mergeMap(this.link)
                        );
                })
            );
    }

    allByNode(args = {}) {
        args = _.defaults({}, args, {
            direction: this.defaultDirection,
            entity: this.defaultEntity
        });

        return validate(edge.allByNode, args)
            .pipe(
                rxop.mergeMap(args => {
                    return this.getAll(_.extend({
                            namespace: this.namespace + args.prefix,
                            inverse: args.onlyNodes ? false : args.inverse
                        }, args))
                        .pipe(
                            rxop.map(response => {
                                if (args.onlyNodes) {
                                    return response.toNode;
                                }

                                return response;
                            })
                        );
                })
            );
    }

    closest(args = {}) {
        args = _.defaults({}, args, {
            direction: this.defaultDirection || null,
            entity: this.defaultEntity
        });

        return validate(edge.closest, args)
            .pipe(
                rxop.mergeMap(args => {
                    return this.getAllByDistance(_.extend({
                        namespace: this.namespace + args.prefix
                    }, args));
                })
            );
    }

    count(args = {}) {
        args = _.defaults({}, args, {
            direction: this.defaultDirection,
            entity: this.defaultEntity
        });

        return validate(edge.count, args)
            .pipe(
                rxop.mergeMap(args => {
                    return this.countEdges(_.extend({
                        namespace: this.namespace + args.prefix
                    }, args));
                })
            );
    }

    delete(args = {}) {
        args = _.defaults({}, args, {
            direction: this.defaultDirection,
            entity: this.defaultEntity
        });

        return validate(edge.del, args)
            .pipe(
                rxop.mergeMap(args => {
                    return this.deleteEdge(_.extend({
                        namespace: this.namespace + args.prefix
                    }, args));
                })
            );
    }

    deleteByNode(args = {}) {
        args = _.defaults({}, args, {
            direction: this.defaultDirection,
            entity: this.defaultEntity
        });

        return validate(edge.delByNode, args)
            .pipe(
                rxop.mergeMap(args => {
                    return this.deleteEdges(_.extend({
                        namespace: this.namespace + args.prefix
                    }, args));
                })
            );
    }

    link(args = {}) {
        args = _.defaults({}, args, {
            direction: this.defaultDirection,
            entity: this.defaultEntity
        });

        return validate(edge.link, args)
            .pipe(
                rxop.mergeMap(args => {
                    return this.setEdge(_.extend({}, args, {
                        distance: args.absoluteDistance ? args.absoluteDistance : -(args.distance * this.decrementPath),
                        namespace: this.namespace + args.prefix
                    }), !args.absoluteDistance);
                })
            );
    }

    traverse(args = {}) {
        return validate(edge.traverse, args)
            .pipe(
                rxop.mergeMap(args => {
                    const initialJob = args.jobs[0];
                    const processedEdges = new Set();
                    const frequency = {
                        all: {}
                    };

                    if (!initialJob) {
                        return rx.of([]);
                    }

                    const closest = (closestArgs, index = 0) => {
                        const operation = (args.remoteClosest && index >= args.remoteClosestIndex) ? args.remoteClosest(closestArgs) : this.closest(closestArgs);

                        return operation.pipe(
                            rxop.filter(({
                                direction,
                                fromNode,
                                entity,
                                toNode
                            }) => {
                                // filter already processed
                                const key = [fromNode, toNode]
                                    .sort()
                                    .concat(direction)
                                    .join(':');

                                const wasProcessed = processedEdges.has(key);

                                if (!wasProcessed) {
                                    processedEdges.add(key);

                                    if (!direction || direction === 'IN') {
                                        frequency.all[fromNode] = frequency.all[fromNode] ? (frequency.all[fromNode] + 1) : 1;
                                    }

                                    if (!direction || direction === 'OUT') {
                                        frequency.all[toNode] = frequency.all[toNode] ? (frequency.all[toNode] + 1) : 1;
                                    }

                                    if (!frequency[entity]) {
                                        frequency[entity] = {};
                                    }

                                    if (!direction || direction === 'IN') {
                                        frequency[entity][fromNode] = frequency[entity][fromNode] ? (frequency[entity][fromNode] + 1) : 1;
                                    }

                                    if (!direction || direction === 'OUT') {
                                        frequency[entity][toNode] = frequency[entity][toNode] ? (frequency[entity][toNode] + 1) : 1;
                                    }
                                }

                                return !wasProcessed;
                            })
                        );
                    };

                    return closest(initialJob)
                        .pipe(
                            rxop.toArray(),
                            rxop.expand((items, index) => {
                                const nextJob = args.jobs[index + 1];

                                if (nextJob && !_.isEmpty(items)) {
                                    return rx.from(items)
                                        .pipe(
                                            rxop.mergeMap(({
                                                fromNode,
                                                toNode
                                            }) => {
                                                return closest(_.extend({}, nextJob, {
                                                    fromNode: toNode
                                                }), index + 1);
                                            }, null, args.concurrency),
                                            rxop.reduce((reduction, items) => {
                                                return reduction.concat(items);
                                            }, [])
                                        );
                                }

                                return rx.empty();
                            }),
                            rxop.mergeMap(items => {
                                return rx.from(items);
                            }),
                            rxop.reduce((reduction, {
                                distance,
                                entity,
                                fromNode,
                                toNode
                            }) => {
                                const tails = _.filter(reduction, ({
                                    toNode
                                }) => toNode === fromNode);

                                if (_.isEmpty(tails)) {
                                    return reduction.concat({
                                        distance,
                                        fromNode,
                                        path: [{
                                            node: fromNode
                                        }, {
                                            distance,
                                            entity,
                                            node: toNode
                                        }],
                                        toNode
                                    });
                                }

                                return reduction.concat(_.map(tails, tail => {
                                    const newDistance = tail.distance + distance;

                                    return {
                                        distance: newDistance,
                                        fromNode: tail.fromNode,
                                        path: tail.path.concat({
                                            distance,
                                            entity,
                                            node: toNode
                                        }),
                                        toNode
                                    };
                                }));
                            }, []),
                            rxop.map(items => _.filter(items, ({
                                path
                            }) => {
                                const length = _.size(path);

                                return length >= args.minPath && length <= args.maxPath;
                            })),
                            rxop.map(items => ({
                                frequency,
                                paths: _.sortBy(items, ['distance'])
                            }))
                        );
                })
            );
    }
};