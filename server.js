import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({ 'message': 'SHIPTIVITY API. Read documentation to see API docs' });
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid priority provided.',
        'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  }
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  let { status, priority } = req.body;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    else {
      let clients = db.prepare('select * from clients').all();
      //retrieve item to be update
      const client = clients.find(client => client.id === id);
      //retrieve items with same status
      let filteredClients = clients.filter(client => client.status === status);
      //update query
      let update = db.prepare(`update clients set priority = @priority, status = @status where id = @id`);
      //check whether priority is provided
      if (priority && validatePriority(priority)) {
        // if priority provided update all priorities with elements of same status to ensure priorities are unique
        let changePriorites = filteredClients.filter((val) => {
          if (val.priority >= priority) {
            val.priority = val.priority + 1;
          }
          if (val.id !== client.id) {
            return val;
          }
        });
        client.status = status;
        client.priority = priority;
        changePriorites = [client, ...changePriorites];
        // update each item now
        changePriorites.forEach(val => {
          update.run({
            priority: val.priority,
            status: val.status,
            id: val.id
          });
        });
        let updatedClients = db.prepare('select * from clients').all();
        return res.status(200).send(updatedClients);
      }
      else {
        // if no priority provided and status of client is same do nothing
        if (client.status === status) {
          return res.status(200).send(clients);
        }
        else {
          // if no priority provided and status of client is different, assign priority biggest priority to client
          let biggest = filteredClients.reduce((big, currentVal) => currentVal.priority > big.priority ? currentVal : big);
          let big_priority = biggest.priority + 1;
          update.run({
            priority: big_priority,
            status: status,
            id: id
          });
          let updatedClients = db.prepare('select * from clients').all();
          return res.status(200).send(updatedClients);
        }
      }
    }
  }
  else {
    return res.status(400).send({
      'message': 'Status not provided.',
      'long_message': 'Provide the following status: [backlog | in-progress | complete].',
    });
  }
  /* ---------- Update code below ----------*/

});

app.listen(3001);
console.log('app running on port ', 3001);
