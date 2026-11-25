import SwiftUI

/// The frame app pages open in over a page (mock `MobileLangleSheet`): the page dimmed behind
/// (a tap closes it), a white panel from the bottom up to the status bar with 16 pt top corners
/// and a grabber; dragging the grabber down closes it. In landscape at most 520 pt wide.
struct SheetFrame: View {
  let sheet: AppModel.Sheet
  let close: () -> Void
  @State private var drag: CGFloat = 0

  var body: some View {
    ZStack(alignment: .bottom) {
      Palette.backdrop
        .ignoresSafeArea()
        .onTapGesture(perform: close)
        .accessibilityLabel("Close")
        .accessibilityAddTraits(.isButton)
      VStack(spacing: 0) {
        grabber
        PageContainer(page: sheet.context.page.view)
      }
      .background(
        UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16)
          .fill(Color.white)
          .shadow(color: Palette.shadow, radius: 15, y: -10)
          .ignoresSafeArea(edges: .bottom)
      )
      .frame(maxWidth: 520)
      .offset(y: drag)
    }
    .transition(.move(edge: .bottom))
  }

  private var grabber: some View {
    Capsule()
      .fill(Palette.grabber)
      .frame(width: 36, height: 5)
      // The 8 pt above it is the panel's top padding, and part of the handle.
      .frame(maxWidth: .infinity, minHeight: 13, alignment: .bottom)
      .contentShape(Rectangle())
      .gesture(
        DragGesture()
          .onChanged { drag = max(0, $0.translation.height) }
          .onEnded { value in
            if value.translation.height > 120 || value.predictedEndTranslation.height > 240 {
              close()
            } else {
              withAnimation(.easeOut(duration: 0.2)) { drag = 0 }
            }
          }
      )
      .accessibilityHidden(true)
  }
}
