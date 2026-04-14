export class MissionDO {
  constructor(private state: DurableObjectState, private env: unknown) {}
  async fetch(req: Request): Promise<Response> {
    return new Response('stub', { status: 501 });
  }
}
