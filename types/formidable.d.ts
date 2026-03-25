declare module "formidable" {
  import type { IncomingMessage } from "http";

  interface FormidableOptions {
    multiples?: boolean;
    keepExtensions?: boolean;
    maxFileSize?: number;
  }

  interface FormidableFile {
    filepath: string;
    originalFilename?: string | null;
    mimetype?: string | null;
    size: number;
    newFilename?: string;
  }

  interface FormidableFiles {
    [fieldName: string]: FormidableFile | FormidableFile[] | undefined;
  }

  type ParseCallback = (
    error: Error | null,
    fields: Record<string, unknown>,
    files: FormidableFiles
  ) => void;

  interface FormidableInstance {
    parse(request: IncomingMessage, callback: ParseCallback): void;
  }

  function formidable(options?: FormidableOptions): FormidableInstance;

  namespace formidable {
    type Options = FormidableOptions;
    type File = FormidableFile;
    type Files = FormidableFiles;
  }

  export type File = formidable.File;
  export type Files = formidable.Files;
  export type Options = formidable.Options;
  export default formidable;
}
