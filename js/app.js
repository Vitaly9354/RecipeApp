'use strict';

/* App Module */

var app = angular.module('recipeApp', ['ngRoute']);

/* Text overflow auto truncate */
app.directive('ellipsis', ['$timeout', '$window', function ($timeout, $window) {
    return {
        restrict: 'A',
        scope: {
            ngBind: '=',
            ellipsisAppend: '@',
            ellipsisAppendClick: '&',
            ellipsisSymbol: '@'
        },
        compile: function (elem, attr, linker) {

            return function (scope, element, attributes) {
                /* Window Resize Variables */
                attributes.lastWindowResizeTime = 0;
                attributes.lastWindowResizeWidth = 0;
                attributes.lastWindowResizeHeight = 0;
                attributes.lastWindowTimeoutEvent = null;
                /* State Variables */
                attributes.isTruncated = false;

                function buildEllipsis() {
                    if (typeof (scope.ngBind) !== 'undefined') {
                        var bindArray = scope.ngBind.split(" "),
							i = 0,
							ellipsisSymbol = (typeof (attributes.ellipsisSymbol) !== 'undefined') ? attributes.ellipsisSymbol : '&hellip;',
							appendString = (typeof (scope.ellipsisAppend) !== 'undefined' && scope.ellipsisAppend !== '') ? ellipsisSymbol + '<span>' + scope.ellipsisAppend + '</span>' : ellipsisSymbol;

                        attributes.isTruncated = false;
                        element.html(scope.ngBind);

                        // If text has overflow
                        if (isOverflowed(element)) {
                            var bindArrayStartingLength = bindArray.length,
								initialMaxHeight = element[0].clientHeight;

                            element.html(scope.ngBind + appendString);

                            // Set complete text and remove one word at a time, until there is no overflow
                            for (; i < bindArrayStartingLength; i++) {
                                bindArray.pop();
                                element.html(bindArray.join(" ") + appendString);

                                if (element[0].scrollHeight < initialMaxHeight || isOverflowed(element) === false) {
                                    attributes.isTruncated = true;
                                    break;
                                }
                            }

                            // If append string was passed and append click function included
                            if (ellipsisSymbol != appendString && typeof (scope.ellipsisAppendClick) !== 'undefined' && scope.ellipsisAppendClick !== '') {
                                element.find('span').bind("click", function (e) {
                                    scope.$apply(scope.ellipsisAppendClick);
                                });
                            }
                        }
                    }
                }
                
                function isOverflowed(thisElement) {
                    return thisElement[0].scrollHeight > thisElement[0].clientHeight;
                }

                /*Execute ellipsis truncate on ngBind update */
                scope.$watch('ngBind', function () {
                    buildEllipsis();
                });

                /* Execute ellipsis truncate on ngBind update */
                scope.$watch('ellipsisAppend', function () {
                    buildEllipsis();
                });

                /* When window width or height changes - re-init truncation */
                angular.element($window).bind('resize', function () {
                    $timeout.cancel(attributes.lastWindowTimeoutEvent);

                    attributes.lastWindowTimeoutEvent = $timeout(function () {
                        if (attributes.lastWindowResizeWidth != window.innerWidth || attributes.lastWindowResizeHeight != window.innerHeight) {
                            buildEllipsis();
                        }

                        attributes.lastWindowResizeWidth = window.innerWidth;
                        attributes.lastWindowResizeHeight = window.innerHeight;
                    }, 75);
                });
            };
        }
    };
}]);

/* CRUD operations with IndexedDB  */

app.factory("services",['$q', function($q) {
    var obj = {}, db;
    db = new Dexie("RecipeDatabase2");

    /* Define a schema */
    db.version(1)
            .stores({
                recipeList: '++&recipeId, title, description, created, version',
                recipeListAudit: '++&id, recipeId, title, description, created, version'
            });

    /* Open the database */
    db.open();    

    obj.openDb = function () {
        if (!db.isOpen()) db.open();
    }

    obj.insertRecipe = function (recipe) {
        obj.openDb();
        
        return db.recipeList.add({
            title: recipe.title,
            description: recipe.description,
            version: recipe.version,
            created: recipe.created
        });
    }

    obj.getRecipeList = function () {
        obj.openDb();

        return db.recipeList.toArray(function (arr) {
            return arr;
        });
    }

    obj.getRecipe = function (recipeID) {
        var defer = $q.defer();
        if (recipeID == 0) {
            defer.resolve({
                title: "",
                description: "",
                created: new Date(),
                version: 0
            });

            return defer.promise;
        }

        obj.openDb();

        return db.recipeList.get(recipeID, function (recipe) {
            return recipe;
        });
    }

    obj.getRecipeByVersion = function (recipeID, version) {
        var defer = $q.defer(), result;
        obj.openDb();       

        db.recipeListAudit.each(function (item) {
            if (item.version == version && item.recipeId == recipeID)
                result = angular.copy(item);
        }).then(function (r) {
            defer.resolve(result);
            return result;
        });

        return defer.promise;
    }

    obj.updateRecipe = function (recipeID, newRecipe, original) {
        var p1,p2, promises = [];

        obj.openDb();

        p1 = db.recipeList.update(recipeID, newRecipe);
        p2 = db.recipeListAudit.add({
            recipeId: original.recipeId,
            title: original.title,
            description: original.description,
            version: original.version,
            created: original.created
        })
        promises.push(p1);
        promises.push(p2);

        return $q.all(promises);
    };

    obj.deleteRecipe = function (recipeID) {
        var arr = [], defer = $q.defer;
        obj.openDb();

        db.recipeListAudit.each(function (item) {
            if (item.recipeId == recipeID)
                arr.push(db.recipeListAudit.delete(item.id), function (recipe) {
                    return recipe;
                });
        });

        arr.push(db.recipeList.delete(recipeID, function (recipe) {
            return recipe;
        }));

        return $q.all(arr);
    };

    return obj;
}]);


app.config(['$routeProvider',
 function ($routeProvider) {
     $routeProvider.
     when('/', {
         title: 'Recipes',
         templateUrl: 'partials/recipeList.html',
         controller: 'RecipeListCtrl',
         resolve: {
             recipeList: function (services) {
                 return services.getRecipeList();
             }
         }
     })
     .when('/recipes/:recipeID', {
         title: 'Edit Recipe',
         templateUrl: 'partials/editRecipe.html',
         controller: 'EditRecipeDetailsCtrl',
         resolve: {
             recipe: function (services, $route) {
                 var recipeID = $route.current.params.recipeID;
                 recipeID = parseInt(recipeID);
                 return services.getRecipe(recipeID);
             }
         }
     })
     .when('/recipes/:recipeID/versions/:version', {
         title: 'View Recipe',
         templateUrl: 'partials/editRecipe.html',
         controller: 'ViewRecipeDetailsCtrl',
         resolve: {
             recipe: function (services, $route) {
                 var recipeID, version;
                 recipeID = $route.current.params.recipeID;
                 version = $route.current.params.version;
                 recipeID = parseInt(recipeID);
                 version = parseInt(version);
                 return services.getRecipeByVersion(recipeID, version);
             }
         }
     })
     .when('/about', {
         title: 'About',
         templateUrl: 'partials/about.html',
         controller: 'AboutCtrl'
     })
     .otherwise({
         redirectTo: '/'
     });
 }]);

app.run(['$location', '$rootScope', 'services', function ($location, $rootScope, services) {
   $rootScope.$on('$routeChangeSuccess', function (event, current, previous) {
        $rootScope.title = current.$$route.title;
    });
}]);

/* Controllers */

app.controller('RecipeListCtrl', function ($scope, services, recipeList) {
   $scope.recipeList = recipeList;
});

app.controller('ViewRecipeDetailsCtrl', function ($scope, $rootScope, services, recipe) {
    $scope.recipe = recipe;
    $scope.isEditable = false;
    $rootScope.title = "View Recipe";
});

app.controller('AboutCtrl', function ($rootScope) {
    $rootScope.title = "About";
});

app.controller('EditRecipeDetailsCtrl', function ($scope, $rootScope, $location, $routeParams, services, recipe) {
    var recipeID, original;
    recipeID = ($routeParams.recipeID) ? parseInt($routeParams.recipeID) : 0;
    $rootScope.title = (recipeID > 0) ? 'Edit Recipe' : 'Add Recipe';
    $scope.buttonText = (recipeID > 0) ? 'Update Recipe' : 'Add New Recipe';
    original = recipe;
    original.recipeId = recipeID;
    $scope.recipe = angular.copy(original);
    $scope.recipe.recipeId = recipeID;
    $scope.isEditable = true;

    $scope.getVersions = function () {
        var arr = [];
        for (var j = recipe.version; j > 0; j--) arr.push(j);
        return arr;
    }

    $scope.isClean = function () {
        return angular.equals(original, $scope.recipe);
    }

    $scope.deleteRecipe = function (recipe) {
        $location.path('/');
        if (confirm("Are you sure you want to delete recipe: " + $scope.recipe.recipeId) == true)
            services.deleteRecipe(recipe.recipeId).then(function (result) {
                console.log('Recipe deleted!');
            }).catch(function (e) {
                console.log(e);
            });
    };

    $scope.saveRecipe = function (recipe) {
        $location.path('/');
        if (recipeID <= 0) {
            recipe.created = new Date();                    
            services.insertRecipe(recipe).then(function(result) {
                console.log('Recipe added!');
            }).catch(function (e) {
                console.log(e);
            });
        }
        else {
            recipe.version = original.version + 1;
            recipe.recipeId = original.recipeId;
            recipe.created = new Date();
            services.updateRecipe(recipeID, recipe, original).then(function (updated) {
               console.log ("Recipe updated!");
            }).catch(function(e) {
                console.log(e);
            });
        }
    };
});
