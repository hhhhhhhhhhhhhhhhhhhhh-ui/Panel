import express, { Response } from 'express';
import pool from '../../db.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const router = express.Router();

// GET all projects
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectsRes = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    const linksRes = await pool.query('SELECT * FROM project_links');

    const projects = projectsRes.rows.map((proj: any) => {
      const projLinks = linksRes.rows.filter((link: any) => link.project_id === proj.id);
      return {
        ...proj,
        links: projLinks
      };
    });

    res.json(projects);
  } catch (err: any) {
    console.error('Failed to get projects:', err.message);
    res.status(500).json({ error: 'Failed to retrieve projects.' });
  }
});

// POST create project
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { name, description, status, settings, links } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }

  try {
    const projResult = await pool.query(
      'INSERT INTO projects (name, description, status, settings) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description || '', status || 'Planning', typeof settings === 'object' ? JSON.stringify(settings) : (settings || '{}')]
    );
    const newProject = projResult.rows[0];

    const insertedLinks: any[] = [];
    if (Array.isArray(links) && links.length > 0) {
      for (const link of links) {
        if (link.name && link.url) {
          const linkResult = await pool.query(
            'INSERT INTO project_links (project_id, name, url) VALUES ($1, $2, $3) RETURNING *',
            [newProject.id, link.name, link.url]
          );
          insertedLinks.push(linkResult.rows[0]);
        }
      }
    }

    res.json({ ...newProject, links: insertedLinks });
  } catch (err: any) {
    console.error('Failed to create project:', err.message);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// PUT update project
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, description, status, settings } = req.body;

  try {
    const result = await pool.query(
      'UPDATE projects SET name = $1, description = $2, status = $3, settings = $4 WHERE id = $5 RETURNING *',
      [name, description, status, typeof settings === 'object' ? JSON.stringify(settings) : settings, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Fetch links too
    const linksRes = await pool.query('SELECT * FROM project_links WHERE project_id = $1', [id]);
    res.json({ ...result.rows[0], links: linksRes.rows });
  } catch (err: any) {
    console.error('Failed to update project:', err.message);
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

// DELETE project
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (err: any) {
    console.error('Failed to delete project:', err.message);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// POST add link
router.post('/:id/links', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, url } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: 'Link name and URL are required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO project_links (project_id, name, url) VALUES ($1, $2, $3) RETURNING *',
      [id, name, url]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Failed to add project link:', err.message);
    res.status(500).json({ error: 'Failed to add project link.' });
  }
});

// DELETE remove link
router.delete('/links/:linkId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { linkId } = req.params;

  try {
    const result = await pool.query('DELETE FROM project_links WHERE id = $1 RETURNING *', [linkId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found.' });
    }
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (err: any) {
    console.error('Failed to delete link:', err.message);
    res.status(500).json({ error: 'Failed to delete link.' });
  }
});

export default router;
