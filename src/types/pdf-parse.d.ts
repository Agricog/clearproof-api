declare module 'pdf-parse' {
  interface PDFData {
    text: string
    numpages: number
    info: Record<string, unknown>
  }
  
  function pdf(buffer: Buffer): Promise<PDFData>
  export default pdf
}
