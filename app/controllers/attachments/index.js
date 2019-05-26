import Controller from '@ember/controller';
import { sort, alias } from '@ember/object/computed';

export default Controller.extend({
  attachments: alias('model'),
  attachmentsSorting: Object.freeze(['id']),
  sortedAttachments: sort('attachments', 'attachmentsSorting'),
});
