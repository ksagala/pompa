import RESTSerializer from '@ember-data/serializer/rest';	
import { normalizeModelName } from '@ember-data/store';	

import Ember from 'ember';
import { singularize, pluralize } from 'ember-inflector';
import { isNone } from '@ember/utils';

/**
  @module ember-data
 */

const {
  classify,
  decamelize,
  camelize,
  underscore
} = Ember.String;

/**
  The ActiveModelSerializer is a subclass of the RESTSerializer designed to integrate
  with a JSON API that uses an underscored naming convention instead of camelCasing.
  It has been designed to work out of the box with the
  [active\_model\_serializers](http://github.com/rails-api/active_model_serializers)
  Ruby gem. This Serializer expects specific settings using ActiveModel::Serializers,
  `embed :ids, embed_in_root: true` which sideloads the records.

  This serializer extends the RESTSerializer by making consistent
  use of the camelization, decamelization and pluralization methods to
  normalize the serialized JSON into a format that is compatible with
  a conventional Rails backend and Ember Data.

  ## JSON Structure

  The ActiveModelSerializer expects the JSON returned from your server
  to follow the REST adapter conventions substituting underscored keys
  for camelcased ones.

  ### Conventional Names

  Attribute names in your JSON payload should be the underscored versions of
  the attributes in your Ember.js models.

  For example, if you have a `Person` model:

  ```js
  App.FamousPerson = Model.extend({
    firstName: attr('string'),
    lastName: attr('string'),
    occupation: attr('string')
  });
  ```

  The JSON returned should look like this:

  ```js
  {
    "famous_person": {
      "id": 1,
      "first_name": "Barack",
      "last_name": "Obama",
      "occupation": "President"
    }
  }
  ```

  Let's imagine that `Occupation` is just another model:

  ```js
  App.Person = Model.extend({
    firstName: attr('string'),
    lastName: attr('string'),
    occupation: belongsTo('occupation')
  });

  App.Occupation = Model.extend({
    name: attr('string'),
    salary: attr('number'),
    people: hasMany('person')
  });
  ```

  The JSON needed to avoid extra server calls, should look like this:

  ```js
  {
    "people": [{
      "id": 1,
      "first_name": "Barack",
      "last_name": "Obama",
      "occupation_id": 1
    }],

    "occupations": [{
      "id": 1,
      "name": "President",
      "salary": 100000,
      "person_ids": [1]
    }]
  }
  ```

  @class ActiveModelSerializer
  @namespace DS
  @extends RESTSerializer
*/
var ActiveModelSerializer = RESTSerializer.extend({
  // SERIALIZE

  /**
    Converts camelCased attributes to underscored when serializing.

    @method keyForAttribute
    @param {String} attribute
    @return String
  */
  keyForAttribute: function(attr) {
    return decamelize(attr);
  },

  /**
    Underscores relationship names and appends "_id" or "_ids" when serializing
    relationship keys.

    @method keyForRelationship
    @param {String} relationshipModelName
    @param {String} kind
    @return String
  */
  keyForRelationship: function(relationshipModelName, kind) {
    var key = decamelize(relationshipModelName);
    if (kind === "belongsTo") {
      return key + "_id";
    } else if (kind === "hasMany") {
      return singularize(key) + "_ids";
    } else {
      return key;
    }
  },

  /**
   `keyForLink` can be used to define a custom key when deserializing link
   properties. The `ActiveModelSerializer` camelizes link keys by default.

   @method keyForLink
   @param {String} key
   @param {String} kind `belongsTo` or `hasMany`
   @return {String} normalized key
  */
  keyForLink: function(key) {
    return camelize(key);
  },

  /*
    Does not serialize hasMany relationships by default.
  */
  serializeHasMany: function() {},

  /**
   Underscores the JSON root keys when serializing.

    @method payloadKeyFromModelName
    @param {String} modelName
    @return {String}
  */
  payloadKeyFromModelName: function(modelName) {
    return underscore(decamelize(modelName));
  },

  /**
    Serializes a polymorphic type as a fully capitalized model name.

    @method serializePolymorphicType
    @param {Snapshot} snapshot
    @param {Object} json
    @param {Object} relationship
  */
  serializePolymorphicType: function(snapshot, json, relationship) {
    var key = relationship.key;
    var belongsTo = snapshot.belongsTo(key);
    var jsonKey = underscore(key + "_type");

    if (isNone(belongsTo)) {
      json[jsonKey] = null;
    } else {
      json[jsonKey] = classify(belongsTo.modelName).replace('/', '::');
    }
  },

  /**
    Add extra step to `RESTSerializer.normalize` so links are normalized.

    If your payload looks like:

    ```js
    {
      "post": {
        "id": 1,
        "title": "Rails is omakase",
        "links": { "flagged_comments": "api/comments/flagged" }
      }
    }
    ```

    The normalized version would look like this

    ```js
    {
      "post": {
        "id": 1,
        "title": "Rails is omakase",
        "links": { "flaggedComments": "api/comments/flagged" }
      }
    }
    ```

    @method normalize
    @param {subclass of Model} typeClass
    @param {Object} hash
    @param {String} prop
    @return Object
  */
  normalize: function(typeClass, hash, prop) {
    this.normalizeLinks(hash);
    return this._super(typeClass, hash, prop);
  },

  /**
    Convert `snake_cased` links  to `camelCase`

    @method normalizeLinks
    @param {Object} data
  */

  normalizeLinks: function(data) {
    if (data.links) {
      var links = data.links;

      for (var link in links) {
        var camelizedLink = camelize(link);

        if (camelizedLink !== link) {
          links[camelizedLink] = links[link];
          delete links[link];
        }
      }
    }
  },

  /**
   * @private
  */
  _keyForIDLessRelationship: function(key, relationshipType) {
    if (relationshipType === 'hasMany') {
      return underscore(pluralize(key));
    } else {
      return underscore(singularize(key));
    }
  },

  extractRelationships: function(modelClass, resourceHash) {
    modelClass.eachRelationship(function (key, relationshipMeta) {
      var relationshipKey = this.keyForRelationship(key, relationshipMeta.kind, "deserialize");

      var idLessKey = this._keyForIDLessRelationship(key, relationshipMeta.kind, "deserialize");

      // converts post to post_id, posts to post_ids
      if (resourceHash[idLessKey] && typeof relationshipMeta[relationshipKey] === 'undefined') {
        resourceHash[relationshipKey] = resourceHash[idLessKey];
      }

      // prefer the format the AMS gem expects, e.g.:
      // relationship: {id: id, type: type}
      if (relationshipMeta.options.polymorphic) {
        extractPolymorphicRelationships(key, relationshipMeta, resourceHash, relationshipKey);
      }
      // If the preferred format is not found, use {relationship_name_id, relationship_name_type}
      if (Object.prototype.hasOwnProperty.call(resourceHash, relationshipKey) && typeof resourceHash[relationshipKey] !== 'object') {
        var polymorphicTypeKey = this.keyForRelationship(key) + '_type';
        if (resourceHash[polymorphicTypeKey] && relationshipMeta.options.polymorphic) {
          let id = resourceHash[relationshipKey];
          let type = resourceHash[polymorphicTypeKey];
          delete resourceHash[polymorphicTypeKey];
          delete resourceHash[relationshipKey];
          resourceHash[relationshipKey] = { id: id, type: type };
        }
      }
    },this);
    return this._super.apply(this, arguments);
  },

  modelNameFromPayloadKey: function(key) {
    var convertedFromRubyModule = singularize(key.replace('::', '/'));
    return normalizeModelName(convertedFromRubyModule);
  }
});

function extractPolymorphicRelationships(key, relationshipMeta, resourceHash, relationshipKey) {
  let polymorphicKey = decamelize(key);
  let hash = resourceHash[polymorphicKey];
  if (hash !== null && typeof hash === 'object') {
    resourceHash[relationshipKey] = hash;
  }
}

export default ActiveModelSerializer;
