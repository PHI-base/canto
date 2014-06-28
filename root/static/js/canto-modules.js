'use strict';

/*global curs_root_uri,angular,$,make_ontology_complete_url,ferret_choose,application_root,window,canto_root_uri,curs_key */

var canto = angular.module('cantoApp', ['ui.bootstrap', 'xeditable']);

function copyObject(src, dest) {
  Object.getOwnPropertyNames(src).forEach(function(key) {
    dest[key] = src[key];
  });
}

// for each property in changedObj, copy to dest when it's different to origObj
function copyIfChanged(origObj, changedObj, dest) {
  Object.getOwnPropertyNames(changedObj).forEach(function(key) {
    if (changedObj[key] !== origObj[key]) {
      dest[key] = changedObj[key];
    }
  });
}

canto.filter('breakExtensions', function() {
  return function(text) {
    return text.replace(/,/g, ', ').replace(/\|/, " | ");
  };
});

canto.config(function($logProvider){
    $logProvider.debugEnabled(true);
});

canto.service('Curs', function($http) {
  this.list = function(key) {
    return $http.get(curs_root_uri + '/ws/' + key + '/list');
  };
});

canto.service('CantoService', function($http) {
  this.lookup = function(key, params) {
    return $http.get(application_root + '/ws/lookup/' + key,
                     {
                       params: params
                     });
  };
});

canto.service('AlleleService', function(CantoService) {
  this.lookup = function(genePrimaryIdentifier, searchTerm, success, error) {
    var q = CantoService.lookup('allele',
                                { gene_primary_identifier: genePrimaryIdentifier,
                                  ignore_case: true,
                                  term: searchTerm });
    q.success(success).error(error);
  };
});

canto.service('AnnotationProxy', function(Curs, $q, $http) {
  this.allAnnotationQ = undefined;

  this.getAllAnnotation = function() {
    if (typeof(this.allAnnotationQ) === 'undefined') {
      this.allAnnotationQ = Curs.list('annotation');
    }

    return this.allAnnotationQ;
  };

  // filter the list of annotation based on the params argument
  // possibilities:
  //   annotationTypeName (required)
  //   genotypeIdentifier
  //   geneIdentifier 
  this.getFiltered =
    function(params) {
      var q = $q.defer();

      this.getAllAnnotation().success(function(annotations) {
        var filteredAnnotations =
          $.grep(annotations,
                 function(elem) {
                   return elem.annotation_type === params.annotationTypeName &&
                     ((!params.geneIdentifier && !params.genotypeIdentifier) ||
                      elem.genotype_identifier === params.genotypeIdentifier ||
                      elem.gene_identifier === params.geneIdentifier);
                 });
        q.resolve(filteredAnnotations);
      }).error(function() {
        q.reject();
      });

      return q.promise;
    };

  this.storeChanges = function(annotation, changes) {
    var q = $q.defer();

    var changesToStore = {};

    copyIfChanged(annotation, changes, changesToStore);
    changesToStore.key = curs_key;

    var putQ = $http.put(curs_root_uri + '/ws/annotation/' + annotation.annotation_id +
                         '/new/change', changesToStore);
    putQ.success(function(response) {
      if (response.status === 'success') {
        // update local copy
        copyObject(changes, annotation);
        q.resolve(annotation);
      } else {
        q.reject(response.message);
      }
    }).error(function() {
      q.reject();
    });

    return q.promise;
  };
});

canto.run(function(editableOptions) {
  editableOptions.theme = 'bs3';
});

function fetch_conditions(search, showChoices) {
  $.ajax({
    url: make_ontology_complete_url('phenotype_condition'),
    data: { term: search.term, def: 1, },
    dataType: "json",
    success: function(data) {
      var choices = $.map( data, function( item ) {
        var label;
        if (typeof(item.matching_synonym) === 'undefined') {
          label = item.name;
        } else {
          label = item.matching_synonym + ' (synonym)';
        }
        return {
          label: label,
          value: item.name,
          name: item.name,
          definition: item.definition,
        };
      });
      showChoices(choices);
    },
  });
}

var conditionPicker =
  function() {
    var directive = {
      scope: {
      },
      restrict: 'E',
      replace: true,
      templateUrl: 'condition_picker.html',
      link: function(scope, elem) {
        var button_html = '';
        var used_buttons = elem.find('.curs-allele-condition-buttons');

        elem.find('.curs-allele-conditions').tagit({
          minLength: 2,
          fieldName: 'curs-allele-condition-names',
          allowSpaces: true,
          placeholderText: 'Type a condition ...',
          tagSource: fetch_conditions,
          //          afterTagAdded: updateScopeConditions,
          //          afterTagRemoved: updateScopeConditions,
          autocomplete: {
            focus: ferret_choose.show_autocomplete_def,
            close: ferret_choose.hide_autocomplete_def,
          },
        });

        used_buttons.find('button').remove();

//        $.each(scope.data.used_conditions,
//               function(cond) {
//                 button_html += '<button class="ui-widget ui-state-default curs-allele-condition-button">' +
//                   '<span>' + cond + '</span></button>';
//               });

        if (button_html === '') {
          used_buttons.hide();
        } else {
          used_buttons.show();
          used_buttons.append(button_html);

          $('.curs-allele-condition-buttons button').click(function() {
            elem.find('curs-allele-conditions').tagit("createTag", $(this).find('span').text());
            return false;
          }).button({
            icons: {
              secondary: "ui-icon-plus"
            }
          });
        }
      }
    };

    return directive;
  };

canto.directive('conditionPicker', conditionPicker);

var alleleNameComplete =
  function(AlleleService) {
    var directive = {
      scope: {
        alleleName: '=',
        alleleDescription: '=',
        alleleType: '=',
        geneIdentifier: '=',
      },
      restrict: 'E',
      replace: true,
      template: '<input ng-model="alleleName" type="text" class="curs-allele-name aform-control" value=""/>',
      link: function(scope, elem) {
        var processResponse = function(lookupResponse) {
          return $.map(
            lookupResponse,
            function(el) {
              return {
                value: el.name,
                display_name: el.display_name,
                description: el.description,
                allele_type: el.allele_type,
                allele_expression: el.expression
              };
            });
        };
        elem.autocomplete({
          source: function(request, response) {
            AlleleService.lookup(scope.geneIdentifier, request.term,
                                 function(lookupResponse) {
                                   response(processResponse(lookupResponse));
                                 },
                                 function() {
                                   alert("failed to lookup allele of: " + scope.geneName);
                                 });
          },
          select: function(event, ui) {
            scope.$apply(function() {
            if (typeof(ui.item.allele_type) === 'undefined' ||
                ui.item.allele_type === 'unknown') {
              scope.type = '';
            } else {
              scope.alleleType = ui.item.allele_type;
            }
            if (typeof(ui.item.label) === 'undefined') {
              scope.alleleName = '';
            } else {
              scope.alleleName = ui.item.label;
            }
            if (typeof(ui.item.description) === 'undefined') {
              scope.alleleDescription = '';
            } else {
              scope.alleleDescription = ui.item.description;
            }
            if (typeof(ui.item.expression) === 'undefined') {
              scope.alleleExpression = '';
            } else {
              scope.alleleExpression = ui.item.expresion;
            }
            });
          }
        }).data("autocomplete" )._renderItem = function(ul, item) {
          return $( "<li></li>" )
            .data( "item.autocomplete", item )
            .append( "<a>" + item.display_name + "</a>" )
            .appendTo( ul );
        };
      }
    };

    return directive;
  };

canto.directive('alleleNameComplete', ['AlleleService', alleleNameComplete]);


var alleleEditDialogCtrl =
  function($scope, $http, $modalInstance, $q, CantoConfig, args) {
    $scope.gene = {
      display_name: args.gene_display_name,
      systemtic_id: args.gene_systemtic_id,
      gene_id: args.gene_id
    };
    $scope.alleleData = {
      name: '',
      description: '',
      type: '',
      expression: '',
      evidence: ''
    };
    $scope.env = {
    };

    $scope.name_autopopulated = false;

    $scope.env.allele_type_names_promise = CantoConfig.get('allele_type_names');
    $scope.env.allele_types_promise = CantoConfig.get('allele_types');

    $scope.env.allele_type_names_promise.then(function(response) {
      $scope.env.allele_type_names = response.data;
    });

    $scope.env.allele_types_promise.then(function(response) {
      $scope.env.allele_types = response.data;
    });

    $scope.maybe_autopopulate = function() {
      if (typeof this.current_type_config === 'undefined') {
        return '';
      }
      var autopopulate_name = this.current_type_config.autopopulate_name;
      if (typeof(autopopulate_name) === 'undefined') {
        return '';
      }

      $scope.alleleData.name =
        autopopulate_name.replace(/@@gene_display_name@@/, this.gene.display_name);
      return this.alleleData.name;
    };

    $scope.$watch('alleleData.type',
                  function(newType) {
                    $scope.env.allele_types_promise.then(function(response) {
                      $scope.current_type_config = response.data[newType];

                      if ($scope.name_autopopulated) {
                        if ($scope.name_autopopulated == $scope.alleleData.name) {
                          $scope.alleleData.name = '';
                        }
                        $scope.name_autopopulated = '';
                      }

                      $scope.name_autopopulated = $scope.maybe_autopopulate();
                      $scope.alleleData.description = '';
                    });
                  });

    $scope.isValidType = function() {
      return !!$scope.alleleData.type;
    };

    $scope.isValidName = function() {
      return !$scope.current_type_config || $scope.current_type_config.allele_name_required == 0 || $scope.alleleData.name;
    };

    $scope.isValidDescription = function() {
      return !$scope.current_type_config || $scope.current_type_config.description_required == 0 || $scope.alleleData.description;
    };

    $scope.isValid = function() {
      return $scope.isValidType() &&
        $scope.isValidName() && $scope.isValidDescription();
      // evidence and expression if needed ...
    };

    // if (data ...) {
    //   populate_dialog_from_data(...);
    // }

    //  var name_input = $allele_dialog.find('.curs-allele-name');
    //  name_input.attr('placeholder', 'Allele name (optional)');

    // return the data from the dialog as an Object
    $scope.dialogToData = function($scope) {
      return {
        name: $scope.alleleData.name,
        description: $scope.alleleData.description,
        type: $scope.alleleData.type,
        evidence: $scope.alleleData.evidence,
        expression: $scope.alleleData.expression,
        gene_id: $scope.gene.gene_id
      };
    };

    $scope.ok = function () {
      $modalInstance.close($scope.dialogToData($scope));
    };

    $scope.cancel = function () {
      $modalInstance.dismiss('cancel');
    };
  };

canto.controller('AlleleEditDialogCtrl',
                 ['$scope', '$http', '$modalInstance', '$q',
                  'CantoConfig', 'args',
                 alleleEditDialogCtrl]);

canto.controller('MultiAlleleCtrl', ['$scope', '$http', '$modal', 'CantoConfig', 'Curs', function($scope, $http, $modal, CantoConfig, Curs) {
  $scope.alleles = [
  ];
  $scope.genes = [
  ];
  $scope.selectedGenes = [
  ];

  Curs.list('gene').success(function(results) {
    $scope.genes = results;

    $.map($scope.genes,
          function(gene) {
            gene.display_name = gene.primary_name || gene.primary_identifier;
          });
    // DEBUG
    $scope.genes[1].selected = true;
    $scope.genes[2].selected = true;
    $scope.selectGenes();
    $scope.openAlleleEditDialog("ssm4", "SPAC27D7.13c", 2);
    $scope.openAlleleEditDialog("doa10", "SPBC14F5.07", 3);
  })
  .error(function() {
    alert('failed to get gene list from server');
  });

  $scope.currentlySelectedGenes = function() {
    return $.grep($scope.genes, function(value) {
      return value.selected;
    });
  };

  $scope.selectGenes = function() {
    $scope.selectedGenes = $scope.currentlySelectedGenes();
  };

  $scope.clearSelectedGene = function() {
    $scope.selectedGenes = [];
  };

  $scope.data = {
    genotype_identifier: '',
    genotype_name: ''
  };

  $scope.env = {
    curs_config_promise: CantoConfig.get('curs_config')
  };

  $scope.$watch('alleles',
                function() {
                  $scope.env.curs_config_promise.then(function(response) {
                    $scope.data.genotype_identifier =
                      response.data.genotype_config.default_strain_name +
                      " " +
                      $.map($scope.alleles, function(val) {
                        var newName = val.name || 'no_name';
                        if (val.description === '') {
                          newName += "(" + val.type + ")";
                        } else {
                          newName += "(" + val.description + ")";
                        }
                        if (val.expression !== '') {
                          newName += "[" + val.expression + "]";
                        }
                        return newName;
                      }).join(" ");
                  });
                },
                true);

  $scope.store = function() {
    $http.post('store', { genotype_name: $scope.data.genotype_name,
                          genotype_identifier: $scope.data.genotype_identifier,
                          alleles: $scope.alleles }).
      success(function(data) {
        if (data.status === "success") {
          window.location.href = data.location;
        } else {
          alert("Storing new genotype failed: " +
                data.message);
        }
      }).
      error(function(){
        console.debug("failed test");
      });
  };

  $scope.removeAllele = function (allele) {
    $scope.alleles.splice($scope.alleles.indexOf(allele), 1);
  };

  $scope.openAlleleEditDialog =
    function(gene_display_name, gene_systemtic_id, gene_id) {
      var editInstance = $modal.open({
        templateUrl: 'alleleEdit.html',
        controller: 'AlleleEditDialogCtrl',
        title: 'Add an allele for this phenotype',
        animate: false,
        windowClass: "modal",
        resolve: {
          args: function() {
            return {
              gene_display_name: gene_display_name,
              gene_systemtic_id: gene_systemtic_id,
              gene_id: gene_id
            };
          }
        }
      });

      editInstance.result.then(function (alleleData) {
        $scope.alleles.push(alleleData);
      });
    };

  $scope.cancel = function() {
    window.location.href = curs_root_uri;
  };

  $scope.isValid = function() {
    if (!$scope.data.genotype_name) {
      return false;
    }

    var alleleGeneIds = {};

    $.map($scope.alleles,
          function(allele) {
            alleleGeneIds[allele.gene_id] = true;
          });

    return $.grep($scope.selectedGenes,
                  function(gene) {
                    return ! alleleGeneIds[gene.gene_id];
                  }).length == 0;
  };
}]);


var EditDialog = function($) {
  function confirm($dialog) {
    var $form = $('#curs-edit-dialog form');
    $dialog.dialog('close');
    $('#loading').unbind('ajaxStop.canto');
    $form.ajaxSubmit({
          dataType: 'json',
          success: function() {
            $dialog.dialog("destroy");
            var $dialog_div = $('#curs-edit-dialog');
            $dialog_div.remove();
            window.location.reload(false);
          }
        });
  }

  function cancel() {
    $(this).dialog("destroy");
    var $dialog_div = $('#curs-edit-dialog');
    $dialog_div.remove();
  }

  function create(title, current_comment, form_url) {
    var $dialog_div = $('#curs-edit-dialog');
    if ($dialog_div.length) {
      $dialog_div.remove();
    }

    var dialog_html =
      '<div id="curs-edit-dialog" style="display: none">' +
      '<form action="' + form_url + '" method="post">' +
      '<textarea rows="8" cols="70" name="curs-edit-dialog-text">' + current_comment +
      '</textarea></form></div>';

    $dialog_div = $(dialog_html);

    var $dialog = $dialog_div.dialog({
      modal: true,
      autoOpen: true,
      height: 'auto',
      width: 600,
      title: title,
      buttons : [
                 {
                   text: "Cancel",
                   click: cancel,
                 },
                 {
                   text: "Edit",
                   click: function() {
                     confirm($dialog);
                   },
                 },
                ]
    });

    return $dialog;
  }

  return {
    create: create
  };
}($);

var QuickAddDialog = function($) {
  function confirm($dialog) {
    var $form = $('#curs-quick-add-dialog form');
    if ($form.validate().form()) {
      $('#loading').unbind('ajaxStop.canto');
      $form.ajaxSubmit({
        dataType: 'json',
        success: function() {
          $dialog.dialog("destroy");
          var $dialog_div = $('#curs-quick-add-dialog');
          $dialog_div.remove();
          window.location.reload(false);
        }
      });
    }
  }

  function cancel() {
    $(this).dialog("destroy");
    var $dialog_div = $('#curs-quick-add-dialog');
    $dialog_div.remove();
  }

  function create(title, search_namespace, form_url) {
    var $dialog_div = $('#curs-quick-add-dialog');
    if ($dialog_div.length) {
      $dialog_div.remove();
    }

    var evidence_select_html = '<select id="ferret-quick-add-evidence" name="ferret-quick-add-evidence"><option selected="selected" value="">Choose an evidence type ...</option>';
    $.map(evidence_by_annotation_type[search_namespace],
          function(item) {
            evidence_select_html += '<option value="' + item + '">' + item + '</option>';
          });
    evidence_select_html += '</select>';

    var with_gene_html =
      '<select id="ferret-quick-add-with-gene" name="ferret-quick-add-with-gene">' +
      '<option selected="selected" value="">With gene ...</option>';
    $.map(genes_in_session,
          function(gene) {
            with_gene_html += '<option value="' + gene.id + '">' + gene.display_name + '</option>';
          });
    with_gene_html += '</select>';

    var dialog_html =
      '<div id="curs-quick-add-dialog" style="display: none">' +
      '<form action="' + form_url + '" method="post">' +
      '<input type="hidden" id="ferret-quick-add-term-id" name="ferret-quick-add-term-id"/>' +
      '<input id="ferret-quick-add-term-input" name="ferret-quick-add-term-entry" type="text"' +
      '       size="50" disabled="true" ' +
      '       placeholder="start typing and suggestions will be made ..." />' +
      '<br/>' +
      evidence_select_html +
      '<br/>' +
      '<div id="ferret-quick-add-with-gene-wrapper" style="display:none">' +
      with_gene_html +
      '</div>' +
      '<input id="ferret-quick-extension" name="ferret-quick-add-extension" type="text"' +
      '       size="50" ' +
      '       placeholder="Optional annotation extension ..." />' +
      '</form></div>';

    $dialog_div = $(dialog_html);

    var select_callback = function(event, ui) {
      $('#ferret-quick-add-term-id').val(ui.item.id);
    };

    var $form = $dialog_div.find('form');
    $form.validate({
      rules: {
        'ferret-quick-add-term-entry': {
          required: true,
        },
        'ferret-quick-add-evidence': {
          required: true,
        },
        'ferret-quick-add-with-gene': {
          required: function() {
           return $('#ferret-quick-add-with-gene').is(':visible');
          }
        }
      }
    });

    var $dialog = $dialog_div.dialog({
      modal: true,
      autoOpen: true,
      height: 'auto',
      width: 600,
      title: title,
      open: function() {
        var ferret_input = $('#ferret-quick-add-term-input');
        ferret_input.autocomplete({
          minLength: 2,
          source: make_ontology_complete_url(search_namespace),
          select: select_callback,
          cacheLength: 100,
        });
        ferret_input.attr('disabled', false);
      },
      buttons : [
                 {
                   text: "Cancel",
                   click: cancel,
                 },
                 {
                   text: "Add",
                   click: function() {
                     confirm($dialog);
                   },
                 },
               ],
    });

    var $with_gene_wrapper = $('#ferret-quick-add-with-gene-wrapper');

    $('#ferret-quick-add-evidence').on('change',
                                       function() {
                                         var evidence = $(this).val();
                                         if (evidence in with_gene_evidence_codes) {
                                           $with_gene_wrapper.show();
                                         } else {
                                           $with_gene_wrapper.hide();
                                         }
                                       });

    return $dialog;
  }

  return {
    create: create
  };
}($);

function UploadGenesCtrl($scope) {
  $scope.data = {
    geneIdentifiers: '',
    noAnnotation: false,
    noAnnotationReason: '',
    otherText: '',
    geneList: '',
  };
  $scope.isValid = function() {
    return $scope.data.geneIdentifiers.length > 0 ||
      ($scope.data.noAnnotation &&
      $scope.data.noAnnotationReason.length > 0 &&
      ($scope.data.noAnnotationReason !== "Other" ||
       $scope.data.otherText.length > 0));
  };
}

function SubmitToCuratorsCtrl($scope) {
  $scope.data = {
    reason: null,
    hasAnnotation: false
  };
  $scope.noAnnotationReasons = ['Review'];

  $scope.init = function(reasons) {
    $scope.noAnnotationReasons = reasons;
  };

  $scope.validReason = function() {
    return $scope.data.reason != null && $scope.data.reason.length > 0;
  };
}

canto.service('CantoConfig', function($http) {
  this.get = function(key) {
    return $http({method: 'GET',
                  url: canto_root_uri + 'ws/canto_config/' + key,
                  cache: true});
  };
});

canto.service('AnnotationTypeConfig', function(CantoConfig, $q) {
  this.getAll = function() {
    if (typeof(this.listPromise) === 'undefined') {
      this.listPromise = CantoConfig.get('annotation_type_list');
    }

    return this.listPromise;
  };
  this.getByName = function(typeName) {
    var q = $q.defer();

    this.getAll().success(function(annotationTypeList) {
      var filteredAnnotationTypes =
        $.grep(annotationTypeList,
               function(annotationType) {
                 return annotationType.name === typeName;
               });
      if (filteredAnnotationTypes.length > 0){
        q.resolve(filteredAnnotationTypes[0]);
      } else {
        q.resolve(undefined);
      }
    }).error(function() {
      q.reject();
    });

    return q.promise;
  };
});

// to be implemented
//var ferretCtrl = function($scope) {
//};
// add ng-controller="FerretCtrl" to <div id="ferret"> in ontology.mhtml
//canto.controller('FerretCtrl', ['$scope', 'CantoConfig', ferretCtrl]);

function UploadGenesCtrl($scope) {
  $scope.data = {
    geneIdentifiers: '',
    noAnnotation: false,
    noAnnotationReason: '',
    otherText: '',
    geneList: '',
  };
  $scope.isValid = function() {
    return $scope.data.geneIdentifiers.length > 0 ||
      ($scope.data.noAnnotation &&
       $scope.data.noAnnotationReason.length > 0 &&
       ($scope.data.noAnnotationReason !== "Other" ||
        $scope.data.otherText.length > 0));
  };
}

function AlleleCtrl($scope) {
  $scope.alleles = [
  {name: 'name1', description: 'desc', type: 'type1'}
  ];
}

function SubmitToCuratorsCtrl($scope) {
  $scope.data = {
    reason: null,
    otherReason: '',
    hasAnnotation: false
  };
  $scope.noAnnotationReasons = [];

  $scope.init = function(reasons) {
    $scope.noAnnotationReasons = reasons;
  };

  $scope.validReason = function() {
    return $scope.data.reason != null && $scope.data.reason.length > 0 &&
      ($scope.data.reason !== 'Other' || $scope.data.otherReason.length > 0);
  };
}


var evidenceSelectCtrl =
  function ($scope) {
    $scope.data = {};
  };

canto.controller('EvidenceSelectCtrl',
                 ['$scope', evidenceSelectCtrl]);


var annotationTable =
  function(AnnotationProxy, AnnotationTypeConfig, $compile) {
    return {
      scope: {
        geneIdentifier: '@',
        genotypeIdentifier: '@',
        annotationTypeName: '@',
      },
      restrict: 'E',
      replace: true,
      templateUrl: application_root + '/static/ng_templates/annotation_table.html',
      link: function(scope, elem) {
        scope.annotations = [];
        AnnotationProxy.getFiltered({annotationTypeName: scope.annotationTypeName,
                                     genotypeIdentifier: scope.genotypeIdentifier,
                                     geneIdentifier: scope.geneIdentifier }).then(function(annotations) {
                                       scope.annotations = annotations;
                                     });
        AnnotationTypeConfig.getByName(scope.annotationTypeName).then(function(annotationType) {
          scope.annotationType = annotationType;
        });
      }
    };
  };

canto.directive('annotationTable', ['AnnotationProxy', 'AnnotationTypeConfig', '$compile', annotationTable]);

var annotationTableList =
  function(AnnotationProxy, AnnotationTypeConfig) {
    return {
      scope: {
        geneIdentifier: '@',
        genotypeIdentifier: '@',
      },
      restrict: 'E',
      replace: true,
      templateUrl: application_root + '/static/ng_templates/annotation_table_list.html',
      link: function(scope) {
        scope.annotationTypes = [];
        AnnotationTypeConfig.getAll().then(function(response) {
          scope.annotationTypes =
            $.grep(response.data,
                  function(annotationType) {
                    if ((typeof(scope.geneIdentifier) === 'undefined' &&
                         typeof(scope.genotypeIdentifier) === 'undefined') ||
                        (typeof(scope.geneIdentifier) !== 'undefined' &&
                         annotationType.feature_type === 'gene') ||
                       (typeof(scope.genotypeIdentifier) !== 'undefined' &&
                         annotationType.feature_type === 'genotype')) {
                      return annotationType;
                    }
                  });
        });
        AnnotationProxy.getFiltered({ annotationTypeName: scope.annotationTypeName,
                                      genotypeIdentifier: scope.genotypeIdentifier,
                                      geneIdentifier: scope.geneIdentifier,
                                    }).then(function(annotations) {
          scope.annotations = annotations;
        });
      }
    };
  };

canto.directive('annotationTableList', ['AnnotationProxy', 'AnnotationTypeConfig', annotationTableList]);


var annotationTableRow =
  function(AnnotationProxy, AnnotationTypeConfig, CantoConfig, Curs) {
    return {
      restrict: 'A',
      replace: true,
      templateUrl: application_root + '/static/ng_templates/annotation_table_row.html',
      controller: function($scope, $element) {
        $scope.data = {};

        AnnotationTypeConfig.getByName($scope.annotation.annotation_type)
          .then(function(annotationType) {
            $scope.annotationType = annotationType;
          });

        CantoConfig.get('evidence_types').success(function(results) {
          $scope.evidenceTypes = results;
        });

        Curs.list('gene').success(function(results) {
          $scope.genes = results;

          $.map($scope.genes,
                function(gene) {
                  gene.display_name = gene.primary_name || gene.primary_identifier;
                });
        }).error(function() {
          alert("couldn't read the gene list from the server");
        });

        $scope.edit = function() {
          $scope.data.changes = {};
          copyObject($scope.annotation, $scope.data.changes);
        };
        $scope.saveEdit = function() {
          var changes = $scope.data.changes;
          delete $scope.data.changes;
          loadingStart();
          $element.addClass('edit-pending');
          var q = AnnotationProxy.storeChanges($scope.annotation, changes);
          q.catch(function(message) {
            alert("saving annotation failed: " + message);
          })
          .finally(function() {
            loadingEnd();
            $element.removeClass('edit-pending');
          });
        };
        $scope.cancelEdit = function() {
          delete $scope.data.changes;
        };
      },
      link: function(scope) {
        scope.test = true;
      }
    };
  };

canto.directive('annotationTableRow', ['AnnotationProxy', 'AnnotationTypeConfig', 'CantoConfig', 'Curs', annotationTableRow]);


var termNameComplete =
  function() {
    return {
      scope: {
        annotationTypeName: '@',
        currentTermName: '@',
        foundTermId: '=',
        foundTermName: '=',
      },
      replace: true,
      restrict: 'E',
      template: '<input type="text" class="form-control" value="{{currentTermName}}"/>',
      link: function(scope, elem) {
        elem.autocomplete({
          minLength: 2,
          source: make_ontology_complete_url(scope.annotationTypeName),
          select: function(event, ui) {
            scope.$apply(function() {
              scope.foundTermId = ui.item.id;
              scope.foundTermName = ui.item.value;
            });
          },
          cacheLength: 100
        });
        elem.attr('disabled', false);
      }
    };
  };

canto.directive('termNameComplete', [termNameComplete]);
